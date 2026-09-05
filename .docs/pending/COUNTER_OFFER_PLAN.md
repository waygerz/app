# Counter-offer negotiation — build spec

Let a challenged member **negotiate** a head-to-head bet before it goes live:
change the **stake and the line** (same game, market, and side) and send it back for
the other side's approval, **unlimited** rounds until someone accepts or declines.

> Ground truth for the current wager lifecycle & money moves:
> `api/contests/app/services/service_wagers.py`, `api/wallet/app/services/service_wallet.py`,
> and `.docs/BETTING_MONEY_FLOW.md`. This spec extends that machine; it does not
> replace it.

## Decisions (locked)

- **Editable in a counter:** the **stake** and, for spread/total, the **line**. The
  event, market (moneyline / spread / total), and the proposer's **side** do **not**
  change — a counter is a renegotiation of the same wager, not a new one.
- **Rounds:** unlimited. Each counter supersedes the previous terms and flips whose
  turn it is to act.
- **Line is always stored proposer-perspective.** `wager.line` is persisted from the
  proposer's side today, and `_resolve_outcome` reads it that way when it settles
  (`service_wagers.py`). The perspective flip is **market-specific**: the webui negates
  only for **spreads** (`web/lib/wagers.ts` `wagerPick` uses `-w.line` in its spread
  branch), while a **total's** line is the same number for both sides and moneyline has
  none. A counter therefore **must not** write the caller's raw number into `wager.line`
  when the caller is the acceptor **on a spread** — it negates first so the stored line
  stays proposer-perspective — but **must not negate a total** (same both sides). See
  *Line perspective* below — getting this wrong silently settles the wrong side.
- **Money:** to counter, the system **holds the counter-er's new stake first** (a
  failed hold 402s cleanly, offer untouched), commits the row naming them `held_id`, and
  the **outgoing holder's stake is released by the reconciler** (best-effort inline
  after commit) — never as an inline step the row depends on. So the row **never names a
  `held_id` whose stake is already gone.** Approval holds the approver's stake at a
  **dedicated `accept` ref** and the bet goes live. At rest one stake is held; during a
  counter, and once ACCEPTED, two are — the reconciler converges any extra.

> **Audited nine times (2026-09-04/05); all passes' findings folded in.** The wallet is a
> **separate service**, so a refund + a hold **cannot** share a DB transaction. The
> load-bearing wallet fact, confirmed against live code: **`uq_txn_idem =
> (account, user_id, ref, type)`, and `hold`/`refund`/`payout` are distinct `type`s — a
> `WAGER_REFUND` does not dedup against, and does not net out, a `WAGER_HOLD` or a
> `WAGER_PAYOUT` at the same `(user, ref)`. Two refunds at one `(user, ref)` dedup; a
> refund and a hold do not.** Everything below is built on that. The **fifth** pass killed
> the previous draft's central trick — "`approve` re-uses the counter's ref and
> dedup-adopts an abandoned strand as its accept hold." Because dedup ignores amount and
> `approve` doesn't move `held_id`, that trick (a) let a concurrent counter's
> compensating refund release the live accept hold → settle creates `2*stake`, (b) adopted
> a strand of the *wrong* amount, and (c) trusted a `held_id` a mid-counter crash had
> already refunded. The redesign removes it: **`approve` holds at its own dedicated
> `accept` ref** (never a counter ref, so no adoption and always the current amount), and
> the counter's outgoing refund is **deferred to a continuous reconciler** (so `held_id`
> is always genuinely held). The reconciler — not any single terminal path — is the
> money-conservation authority: it enforces "net-outstanding holds == the row's expected
> set" for OPEN and ACCEPTED, and **settle reconciles orphans then pays out; settle/void
> never blanket-refund the two legit holds, and the reconciler never runs on a settled
> wager** (its holds are consumed by the payout). Also fixed and kept: line normalization
> negates **spreads only** (a total is two-sided). The **sixth** pass caught that the
> reconciler reads the row and the wallet holds non-atomically, so a just-placed hold could
> read as an orphan and be refunded — fixed by an **age gate** (reclaim only holds older
> than `RECONCILE_MIN_AGE`, targeted refunds stay immediate). The **seventh** pass caught
> that (a) the age gate's `[A]→[C]` bound was not actually enforced — `gthread` doesn't kill
> a slow request and no `lock_timeout` is set, so the re-lock could block indefinitely — now
> fixed by a **`lock_timeout` on the re-lock** plus **per-attempt `nonce` refs** with the
> exact ref stored in `held_ref`/`accept_ref` (so a re-attempt can never dedup onto a
> reclaimed hold); and (b) two even-money refund-both sites (`confirm` push and
> `_settle_due` COMPLETED push) still refunded at the base ref — now generalized like
> `_void_refund`. Do not restore "atomic refund-then-hold," do not give `approve` a
> counter-family ref, do not remove the re-lock `lock_timeout` or the per-attempt nonce, do
> not leave any refund-both/payout site at the base ref for a countered wager, do not make a
> payout site a *post-hoc* reconciler trigger, and do not age-gate the two targeted refunds.
> The **eighth** pass caught a *fifth* refund-both site — `approve_cancel` (the mutual-cancel
> triad), with its own inline base-ref loop (not routed through `_void_refund`) — now
> generalized like the rest; and that the age-gated per-transition reconcile could strand a
> *young* orphan once a wager went terminal, so the periodic backstop now also rescans
> DECLINED / CANCELLED / REFUNDED wagers that still hold an outstanding stake. When
> implementing, **grep every `refund(` site** rather than trusting any enumeration. The
> **ninth** pass caught that a full-uuid nonce overflows `transactions.ref VARCHAR(64)` — so
> the nonce is a **12-hex-char short token** (all refs fit 64, no wallet migration) — and
> that the pre-payout reconcile must be **immediate, not age-gated** (a young strand would
> otherwise survive into SETTLED and never be rescanned). Keep the nonce short, and never
> age-gate a payout-site reconcile.

## Model

Rather than spawn a new wager per round (which would scramble the proposer/side
framing), negotiation happens **in place** on the one wager row, tracked by ids, the
live terms, and a monotonic stake-round counter:

New `wagers` columns:

| Column | Meaning |
|---|---|
| `held_id` (uuid, nullable) | the member whose single negotiation stake is **currently held**. Initially the proposer; becomes the last counterer. |
| `held_ref` (text) | the **exact ref string** at which `held_id`'s stake is held (`wager:{id}` for a propose/migrated row; `wager:{id}:r{n}:{nonce}` after a counter). Every refund of that stake and the reconciler key off this stored string — never a recomputed ref. |
| `stake_round` (int, default 0) | monotonic counter **bumped only by `counter`** (propose = 0, each counter +1). `approve` does **not** bump it — the approver holds at its own `accept_ref`, not a counter round. Used to detect a race (a counter landed under an active snapshot, `stake_round != s0`) and to number each counter's ref (`r{stake_round}`). |
| `accept_ref` (text, nullable) | the **exact ref string** where the **approver's** stake is held, once ACCEPTED (`null` while OPEN). New approvals set it to `wager:{id}:accept:{nonce}`; the migration sets pre-existing ACCEPTED/COMPLETED rows to the base ref `wager:{id}` (where today's `accept` held). settle/void/reconciler read the approver's obligation from this, never by guessing. |
| `pending_id` (uuid, nullable) | the member whose **turn** it is to approve / counter / decline. Initially the acceptor. `null` once the wager leaves negotiation. |
| `negotiation` (jsonb, default `[]`) | append-only round log: `[{by, amount_cents, line, at}]`, for the history strip and audit. |

`amount_cents` and `line` continue to hold the **current** proposed terms (updated in
place each round). `proposer_id`, `acceptor_id`, `proposer_side`, `bet_type`,
`event_id` are immutable for the life of the wager.

### The canonical hold refs (load-bearing)

Holds live at **per-attempt unique refs**, and the row stores each live stake's **exact
ref string** — so a hold placed by one attempt can never be dedup-adopted *or*
dedup-reclaimed by another, and the reconciler matches exact strings rather than
recomputing a ref:

```
propose hold   =  "wager:{id}"                    # round 0, base ref (migration-compatible)
counter hold   =  "wager:{id}:r{n}:{nonce}"       # n = stake_round+1; nonce fresh per attempt
approve hold   =  "wager:{id}:accept:{nonce}"     # nonce fresh per attempt
settle payout  =  "wager:{id}"  (type WAGER_PAYOUT)  # distinct type — never collides with a hold
```

> **Ref length (ninth-audit CRITICAL).** The wallet stores `transactions.ref` as
> **`VARCHAR(64)`** (`api/wallet/app/models/transaction.py`) and a wager id is a 36-char
> UUID, so `"wager:{id}"` is 42 chars. A **full-uuid** nonce would push the accept ref to
> ~86 chars → Postgres `value too long for character varying(64)` → the hold 500s → the
> feature is dead on arrival. So the **`nonce` is a short token — 12 lowercase-hex chars
> (48 bits, e.g. the first 12 of a `uuid4().hex`)** — which it need only be unique among a
> single wager's own recent attempts (the ref already carries the wager id), for which 48
> bits is overkill. Budget: `6 ("wager:") + 36 (uuid) + 8 (":accept:") + 12 = 62 ≤ 64`
> for the accept family (the tightest), and `42 + ":r" + n + ":" + 12 ≤ 64` for counters up
> to a 6-digit round. **No wallet-table migration is required** (the only new columns are on
> the `wagers` table). If a future ref scheme needs more room, widen `transactions.ref` (and
> its `uq_txn_idem` index) instead — but v1 fits 64 by construction.

`nonce` is that **fresh short token generated server-side on each counter/approve attempt**
(no client key needed — mobile-safe). Making every attempt's hold a distinct `(user, ref)`
closes two hazards at once:
- a **failed** attempt's hold is a unique orphan the reconciler reclaims, and a later
  re-attempt mints a **fresh** hold — it can never dedup onto an already-reclaimed hold
  (the "retry-onto-refunded-hold" underfunding the seventh audit warned of);
- a **succeeded** attempt is made idempotent not by ref reuse but by the `pending_id`
  **flip**: an HTTP-level replay of a committed counter fails the `caller == pending_id`
  guard (see *Locking*), so it never places a second hold.

The row's `held_ref` / `accept_ref` store the **exact** strings of the (at most two) live
stakes; every refund and the reconciler key off those, never a recomputed ref. **Round 0
is the bare base ref** so a migrated wager's propose hold needs no rewrite, and `settle`'s
payout at the base ref carries the distinct `WAGER_PAYOUT` type so it never collides with
a hold there.

**Migration / back-compat:** existing rows get `held_id = proposer_id`,
`held_ref = "wager:{id}"` (the base ref where propose held), `stake_round = 0`,
`pending_id = (status = 'open' ? acceptor_id : null)`, `negotiation = []`, and
`accept_ref = (status IN ('accepted','completed','settled') ? "wager:{id}" : null)` —
today's `accept` held the acceptor's stake at the **base** ref too. So a pre-existing
accepted wager reconciles/voids with both stakes at base (proposer via
`held_ref = base`, acceptor via `accept_ref = base`, distinct users) — exactly today's
behavior — while every new counter/approve uses a fresh-nonce ref. Code defaults mirror
this so old rows behave exactly as today.

## State & money, per action

All actions require `status = OPEN` and re-check status / `pending_id` / `stake_round`
under a short row `_lock` (see *Locking* — the wallet I/O runs **outside** the lock).
Amounts re-validate against the league's min/max (a `$0` bragging bet skips bounds); a
spread/total line must be present, numeric, and stored proposer-perspective. **Timing
guards match today's per-action semantics:** *approve* uses only the "game already
started" cutoff (as `accept` does now — accept has **no** 10-minute lock); *withdraw*
keeps `cancel`'s `CANCEL_LOCK_SECONDS` lock; *counter* uses the started cutoff (like
accept) so you can renegotiate up to kickoff.

| Action | Who | Money move | Result |
|---|---|---|---|
| **Propose** (today) | proposer | `hold(proposer, stake, "wager:{id}")` | OPEN · held=proposer · held_ref=base · stake_round=0 · pending=acceptor |
| **Counter** | the `pending_id` member (must ≠ `held_id`) | `n = stake_round+1`, fresh `nonce`; `hold(counterer, new_stake, "wager:{id}:r{n}:{nonce}")`, commit row (`held_ref` = that string), **then** best-effort targeted `refund(old held_id, old_stake, old held_ref)` — the reconciler is the guarantee, not this call | OPEN · held=counterer · held_ref=new · stake_round=n · pending=other · terms updated · round appended |
| **Approve** | the `pending_id` member | fresh `nonce`; `hold(pending_id, stake, "wager:{id}:accept:{nonce}")` → both held; `held_id`/`held_ref`/`stake_round` **unchanged** | ACCEPTED · pending=null · `accept_ref` set (this is `accept`, generalized to its own ref) |
| **Decline** | the `pending_id` member | `refund(held_id, stake, held_ref)` + reconcile | DECLINED |
| **Withdraw** | the `held_id` member (the one waiting) | `refund(held_id, stake, held_ref)` + reconcile | CANCELLED |

Key point: **the wallet is a separate service — contests can't wrap a refund and a
hold in one transaction.** So a counter **holds the counter-er first** (a 402 leaves the
standing offer untouched), commits the row naming them `held_id`, and only *then* releases
the outgoing holder. That release is **best-effort**: the row's correctness never depends
on it landing, because the reconciler refunds any stake outside the row's expected set.
So the row **never names a `held_id` whose stake is already refunded** (the crash window
that underfunded an ACCEPTED wager in the previous draft) — `held_id` is always genuinely
held. Two stakes are briefly held during a counter; the reconciler converges back to one.

Existing paths are **generalized** to operate on `held_id` / `pending_id` / `held_ref`
/ `accept_ref` instead of hard-coded `acceptor` / `proposer` / base ref. **Every
even-money refund-both site must move together.** Audit the code for *all* of them —
`grep` every `refund(` that fires for both `proposer_id` and `acceptor_id`, or at
`_ref(id)`/base — do not trust this list to be exhaustive; the seventh audit caught two
missed push sites and the eighth caught `approve_cancel`:
- `accept` → holds `pending_id` (was: acceptor) at a fresh **`wager:{id}:accept:{nonce}`**
  (was: base ref), sets ACCEPTED and `accept_ref` to that string, `pending_id = null`;
  leaves `held_id`/`held_ref`/`stake_round` as-is (the last counterer stays `held_id`).
- `decline` → refunds `held_id` (was: proposer) at `held_ref`, then reconciles.
- `cancel` (withdraw) → refunds `held_id` at `held_ref`, allowed only for `held_id`
  (was: proposer), then reconciles.
- **scheduler open-offer expiry** (`_settle_due`) and **`purge_user`'s OPEN branch**
  both refund the single staker — change both from `refund(proposer_id, …, _ref(id))`
  to `refund(held_id, current amount, held_ref)` (else a wager the acceptor countered
  last refunds the wrong person, amount, **and** ref), then reconcile.
- **The five refund-both / void sites** — `_void_refund` (void), **`approve_cancel`** (the
  mutual-cancel triad `request_cancel`/`approve_cancel`/`reject_cancel`, which has its **own
  inline** `for uid in (proposer_id, acceptor_id): refund(…, _ref(id))` loop — it does *not*
  route through `_void_refund`), **`confirm`'s push branch**, **`_settle_due`'s
  COMPLETED-push loop**, and **`purge_user`'s COMPLETED branch** — must refund each party at
  its **real held ref**: `refund(held_id, amount, held_ref)` **and**
  `refund(other_party, amount, accept_ref)`, where `other_party` is the proposer/acceptor
  that isn't `held_id` and both amounts equal the current `amount_cents` (even-money: a
  counter sets `amount_cents` to its own offer and holds exactly that, and approve holds the
  same current amount, so both live holds are `amount_cents`), then reconcile. **Was: all
  refunded at the base ref** — which for a countered wager refunds the wrong ref, stranding
  the real hold and minting an unmatched credit. Worse for `approve_cancel`: the proposer's
  base refund **dedups against the counter's outgoing [B] refund at round 0** (both
  `(proposer, base, WAGER_REFUND)`), so the proposer is silently shorted their whole stake
  on *any* countered→accepted→cancelled wager. A push is routine on a spread/total, mutual
  cancel is exposed on every ACCEPTED wager, and the line is counterable, so these are hit
  in normal play — do **not** leave any of the five at the base ref.
- **All payout sites reconcile first, never after.** `settle_one`, the `_settle_due`
  COMPLETED loop, `confirm`, and `purge_user`'s COMPLETED branch each **reconcile** (release
  any orphan outside the two expected refs) **before** paying `WAGER_PAYOUT` at the base
  ref, which consumes the two legit holds. None may reconcile *afterward* — once the payout
  lands the holds are consumed, and a later reconcile would refund them and **create money**.

Because a freshly proposed wager has `held_id = proposer`, `held_ref = base`,
`pending_id = acceptor`, today's behavior is the zero-round case of the same rules.

## Locking (M1 — don't hold the row across HTTP; and bound `[A]→[C]`)

`_lock` is `SELECT … FOR UPDATE`. Holding the row lock across even one wallet round-trip
would let a hot wager plus the scheduler `_settle_due` tick pile up on lock-wait and
exhaust the (gthread) worker's threads. So counter and the generalized accept run their
hold **outside** the lock, with an optimistic re-check; the outgoing refund runs
best-effort *after* the commit.

> **Bounding `[A]→[C]` (seventh-audit CRITICAL fix).** The age gate is only sound if a
> counter's hold [A] and its row commit [C] are separated by **less than
> `RECONCILE_MIN_AGE`**. The stack does **not** give that for free: contests runs
> `gunicorn --worker-class gthread --timeout 120`, and a `gthread` worker is **not** killed
> for a single thread blocked on I/O, and no Postgres `lock_timeout`/`statement_timeout` is
> configured — so a plain `SELECT … FOR UPDATE` re-lock could block **indefinitely** behind
> a terminal path that holds the row lock across its own wallet HTTP. A live hold could
> then age past `RECONCILE_MIN_AGE` before [C] lands, and the reconciler would refund it.
> **So the re-lock (step 3) MUST run under a `lock_timeout` well below `RECONCILE_MIN_AGE`
> (e.g. `SET LOCAL lock_timeout = '10s'` before the `FOR UPDATE`).** If it can't acquire in
> time it aborts to step-4's compensation (refund this attempt's own hold) rather than
> committing [C] late. This caps `[A]→[C]` at `wallet_timeout + lock_timeout` (~20s) — set
> `RECONCILE_MIN_AGE` an order of magnitude above that (default **5 minutes**).

1. **Lock briefly, validate, snapshot:** re-check `status = OPEN`, caller `== pending_id`,
   caller `≠ held_id`, timing cutoff, bounds/line; read `stake_round` (call it `s0`),
   `held_id`, `held_ref`, `amount_cents`; generate a fresh `nonce`. Release the lock.
2. **Wallet I/O unlocked (hold only):** `hold(counterer, new, "wager:{id}:r{s0+1}:{nonce}")`.
   The outgoing holder's refund is **not** part of this pre-commit step — a crash here can
   therefore never leave `held_id` refunded-but-still-named.
3. **Re-lock (under `lock_timeout`) and commit terms** only if `status = OPEN` **and**
   `stake_round == s0` still (nobody moved). If so: set terms, `held_id = counterer`,
   `held_ref = "wager:{id}:r{s0+1}:{nonce}"`, `stake_round = s0+1`, `accept_ref` untouched,
   append the round, flip `pending_id`, commit [C]. **Then** best-effort, **targeted**
   `refund(old held_id, old amount, old held_ref)` [B] — a named refund of the one
   superseded stake, **not** a swept reconcile. The age-gated reconciler backstops if [B]
   never lands. If the re-lock **times out**, treat as step-4's "genuinely lost."
4. **Re-lock resolves one of three cases.** A `WAGER_REFUND` does **not** dedup against
   this action's `WAGER_HOLD` (different `type`), so a blind compensating refund would
   *release* a hold the winning commit made live. Decide by reading the committed row:
   - **My counter already committed** (`status = OPEN` **and** `held_id == counterer`
     **and** `held_ref == this attempt's ref`): a sibling of *this* request won. Return
     idempotent success. **Do not refund** — that ref is now the live held stake. *Sound
     because* the ref carries this attempt's `nonce`, so only *this* attempt's own commit
     can match it; and `approve` holds at an `accept_ref`, never at a counter ref.
   - **Still my turn, nothing moved** (`status = OPEN`, `stake_round == s0`, `held_id`
     unchanged): the normal path — commit (step 3).
   - **Genuinely lost** (re-lock timed out, status left OPEN, or the committed row does
     **not** show my ref as `held_ref`): my hold is orphaned (a *different* attempt/counter
     advanced the round, or the wager terminated). Issue
     `refund(counterer, new, "wager:{id}:r{s0+1}:{nonce}")` and return "no longer your
     turn." The reconciler and any terminal path reclaim the same orphan at the same
     `(counterer, that ref, WAGER_REFUND)`, so all such refunds **dedup** — at most one runs.

This keeps the FOR UPDATE window to microseconds and moves all blocking I/O outside it.
The generalized **approve** runs the same shape (also under `lock_timeout`) —
`hold(pending_id, amount, "wager:{id}:accept:{nonce}")` unlocked, then re-lock: if
`status = OPEN` and `stake_round` unchanged, commit ACCEPTED (set `accept_ref` to that
string, `pending_id = null`); if a counter advanced `stake_round` (or the re-lock times
out), its hold is orphaned → `refund(pending_id, amount, "wager:{id}:accept:{nonce}")` and
"terms changed"; a replay whose approve already committed fails the `caller == pending_id`
guard. Because each attempt's ref carries a fresh `nonce` and `accept_ref` is disjoint from
every counter ref, an approve and a concurrent counter (or two attempts of either) never
touch each other's hold.

## Line perspective (M2 fix, corrected — negate SPREAD only)

`wager.line` is stored **proposer-perspective**, but the perspective flip is
**market-specific** — check `wagerPick` (`web/lib/wagers.ts`), which negates the line
**only for `SPREAD`** (its `-w.line`); a **total's** line is identical for both sides
(Over 8.5 / Under 8.5 both reference 8.5) and is returned un-negated, and moneyline has
no line. So the counter endpoint normalizes by **market**, not by caller alone:

- **Spread:** take the line in the **caller's** perspective (what their stepper shows).
  If the caller is the **proposer**, store as-is; if the **acceptor**, store `-input`
  (mirroring `wagerPick`). This keeps `wager.line` proposer-perspective so
  `_resolve_outcome`'s spread math settles the correct side.
- **Total:** store the stepper value **as-is** for either caller — the line is the same
  number for both sides. **Never negate a total.** Negating would store e.g. `-8.5`, and
  `_resolve_outcome`'s `combined = hs + aw` vs `wager.line` test (`combined > line`) would
  then hold for *every* score → totals silently settle "over" unconditionally.
- **Moneyline:** no line; the counter carries `amount_cents` only.

`to_dict()` continues to emit the stored `line`; the webui continues to flip it per
viewer exactly as `wagerPick` does (spread only). This guarantees `_resolve_outcome`
always reads a proposer-perspective line and settles the correct side.

## API

- `POST /v1/gameplay/contests/wagers/{id}/counter` — body `{ amount_cents, line? }`
  (`line` in the **caller's** perspective; normalized per *Line perspective*).
  Guard: caller `== pending_id`, caller `!= held_id`, status OPEN, timing cutoff,
  bounds/line validation. Runs the unlocked hold-first / refund / re-check-and-commit
  sequence (*Locking*), appends the round, flips `pending_id`, notifies the other party.
- **Approve** is the existing `POST …/wagers/{id}/accept` (now identity-generalized,
  holding at a fresh `wager:{id}:accept:{nonce}` and leaving `held_id`/`held_ref`/
  `stake_round` in place) — no new endpoint.
- **Withdraw** is the existing `…/wagers/{id}/cancel` (OPEN-state, by `held_id`).
- **Mutual cancel** of an ACCEPTED wager — the existing `request_cancel` / `approve_cancel` /
  `reject_cancel` triad — is unchanged in *identity* logic (the two parties are still the
  immutable `proposer_id` / `acceptor_id`), but `approve_cancel`'s **refund** must be
  generalized to the two real held refs (`held_ref` / `accept_ref`) + reconcile — see *State
  & money*; leaving it at the base ref shorts the proposer on any countered wager.
- **`/c/<code>` link — backend:** today `resolve_code` / `act_on_code` gate actions on
  the caller being the **acceptor**, which breaks when it's the *proposer's* turn. Both
  must key off `pending_id`, and `resolve_code`'s `relationship` must expose a
  **`my_turn`** notion (offer Accept/Decline to whoever's turn it is). **No counter
  action over the link** in v1 — countering is in-app; the link stays Accept/Decline.
- **`my_turn` placement:** compute it where the viewer identity exists — thread `me`
  into `_enrich(wagers, me)` (and `get_wager(id, me)` / `resolve_code` / `act_on_code`,
  which all have `me`), **not** in the identity-less `to_dict()`. `to_dict()` gains
  `held_id`, `pending_id`, `stake_round`, `negotiation` (internal ref strings
  `held_ref`/`accept_ref` stay server-side); the enrich layer adds derived
  `my_turn = (pending_id == me)`.

## Recovery & reconciliation (the money-conservation authority)

A counter is up to three commits that cannot be atomic: `hold` [A] commits in the wallet;
the contests row change commits at [C]; the outgoing refund [B] is best-effort *after*
[C]. The design does **not** try to make any single path crash-clean. Instead one
continuous **reconciler** enforces a single invariant, and every action is written so the
reconciler can always converge it. It rests on the wallet fact — **`WAGER_REFUND` neither
dedups against nor nets a `WAGER_HOLD`/`WAGER_PAYOUT`; two refunds at one `(user, ref)`
dedup.**

> **Invariant.** For a non-settled wager, the set of **net-outstanding `WAGER_HOLD`s**
> under `wager:{id}` (holds minus matching-`(user, ref)` refunds) equals the row's
> **expected set**, matched by **exact stored ref string**:
> - **OPEN** → exactly `{ held_id @ held_ref }`.
> - **ACCEPTED or COMPLETED** → exactly `{ held_id @ held_ref, other_party @ accept_ref }`
>   (`other_party` = the proposer/acceptor that isn't `held_id`; both holds = current
>   `amount_cents`). *COMPLETED (legacy-only, pre-payout) holds both stakes — its expected
>   set is ACCEPTED's, never `{}`.*
> - **terminal-but-not-settled** (DECLINED / CANCELLED — the terminal action already
>   refunded the held stake) → `{}` (empty; every remaining hold is an orphan).
> - **SETTLED** → the reconciler is **never** invoked (the `WAGER_PAYOUT` consumed the
>   holds; sweeping would refund them and create money).
>
> Any outstanding hold **not** in the expected set is an orphan; the reconciler refunds it
> at its **own** `(user, ref)`. It **never** refunds a hold in the expected set.

> **Age gate (the load-bearing concurrency rule).** The reconciler reads the row and the
> wallet holds over **separate** calls — the M1 rule forbids holding the row lock across
> the wallet HTTP — so the two are **not** a consistent snapshot: a counter's hold [A] can
> be committed in the wallet while its row commit [C] is still pending, and that live hold
> would read as an orphan against the pre-counter row. Therefore the **general** reconciler
> refunds an orphan **only if that hold has been outstanding longer than
> `RECONCILE_MIN_AGE`** (each hold's age is returned by `/internal/holds`, from the wallet
> `Transaction.created_at`). The gate is sound **because `[A]→[C]` is bounded**: *Locking*
> step 3 re-locks under a `lock_timeout` (~10s) and aborts-to-compensation rather than
> committing late, so `[A]→[C] ≤ wallet_timeout + lock_timeout` (~20s). Set
> `RECONCILE_MIN_AGE` an order of magnitude above that — default **5 minutes**. (Do **not**
> rely on the gunicorn worker timeout to bound a request: contests uses `gthread`, which
> does not kill a thread blocked on I/O, and no `statement_timeout` is set — the
> `lock_timeout` on the re-lock is what actually provides the bound.) By `RECONCILE_MIN_AGE`
> an in-flight counter has either committed [C] (its hold is the legit `held_id`, *inside*
> the expected set, never swept) or aborted/died (a genuine orphan, safely reclaimed). The
> **targeted** refunds — the counter's post-[C] `[B]` and the *Locking* step-4 compensation
> — are **not** age-gated: each names one specific `(user, ref)` and can never touch a live
> hold. Only the compute-expected-then-sweep path needs the gate. (Cost: a dead request's
> strand is returned after at most `RECONCILE_MIN_AGE`, never lost.)

Why the invariant is always convergent, under every crash window:

1. **`held_id` is always genuinely held.** A counter holds the new stake [A] *before*
   committing the row [C] (with the bounded `lock_timeout` re-lock), and defers the outgoing
   refund to after [C]. Two things keep the row from ever naming a refunded `held_id`:
   (i) the deferred outgoing refund [B] is **targeted** at the specific *old*
   `(held_id, old held_ref)`, never at the new hold; (ii) the general reconciler is
   **age-gated** while `[A]→[C]` is `lock_timeout`-bounded, so the new hold (younger than
   `RECONCILE_MIN_AGE` when [C] lands) is never swept. By the time any hold is old enough to
   sweep, its counter's [C] has committed (the hold is the legit `held_id @ held_ref`, in the
   expected set) or the attempt aborted/died (a true orphan — and a *re-attempt* mints a
   fresh-`nonce` hold, so it never dedups onto the reclaimed one). The underfunded-ACCEPTED
   window of the previous drafts cannot occur.
2. **Every orphan is reclaimable at its own ref, exactly once.** The only outstanding holds
   outside the expected set are: an outgoing holder a counter just superseded
   (`old held_id @ old held_ref`); an abandoned/lost/aborted counter attempt
   (`counterer @ its fresh-nonce ref`); or a *losing* approve attempt
   (`pending_id @ its fresh-nonce accept ref` — a *committed* approve instead makes its ref
   the stored `accept_ref`, **inside** the expected set). Each is refunded at its own
   `(user, ref)`; the inline best-effort refund, the *Locking* step-4 compensation, and the
   reconciler all target the same `(user, ref, WAGER_REFUND)` and therefore **dedup to a
   single refund**. No orphan can sit at a ref inside the expected set: every hold ref is
   per-attempt unique (nonce), and the stored `held_ref`/`accept_ref` are the exact strings
   of the *committed* holds, so an orphan's ref is always ≠ both.
3. **Idempotent retry / replay.** [A] at a fresh nonce means a *re-attempt* never
   double-charges a committed hold — a committed counter flipped `pending_id`, so a replay
   fails the `caller == pending_id` guard; a re-attempt after a failure holds fresh and its
   own [C] wins or self-compensates (*Locking* step 4). The old attempt's stranded hold is
   reclaimed by the age-gated reconciler.

**Two refund mechanisms.**
- **Targeted (immediate, not age-gated):** the counter's post-[C] `refund(old held_id,
  old amount, old held_ref)` [B] and the *Locking* step-4 compensation. Each names one
  known `(user, ref)` — safe and immediate, giving fast convergence for the common case
  (a counter supersedes the prior holder).
- **General reconcile:** add wallet internal
  `GET /internal/holds?ref_prefix=wager:{id}` returning each net-outstanding hold by
  `(user, ref)` **with its age** (from `Transaction.created_at`). Compute the expected set
  from a **freshly-read** row (matching by exact `held_ref`/`accept_ref` strings) and refund
  every outstanding hold outside the set, at its own ref. It has two invocation modes:
  **age-gated** (only reclaim holds older than `RECONCILE_MIN_AGE`) for the *speculative*
  callers that can race an in-flight `[A]→[C]` — the per-transition and periodic-backstop
  runs over OPEN wagers; and **immediate** (any age) at the **payout sites**, where the wager
  is already ACCEPTED/COMPLETED and no in-flight hold can exist. This is the safety net for
  anything the targeted refund missed (a dead/aborted attempt's [A] strand, a lost concurrent
  approve/counter).

`reconcile(wager)` (the general, age-gated path) runs:
- **after every terminal transition**, following that path's own refund(s): the OPEN→terminal
  paths (decline / withdraw / `_settle_due` expiry / `purge_user` OPEN) **and** the
  ACCEPTED→terminal refund-both / void sites (`_void_refund`, `approve_cancel`, the `confirm`
  / `_settle_due`-COMPLETED / `purge_user`-COMPLETED push branches);
- **before every payout** — `settle_one`, the `_settle_due` COMPLETED loop, `confirm`, and
  `purge_user`'s COMPLETED branch (all four payout sites, not just settle) — so any orphan
  is cleared before the `WAGER_PAYOUT` consumes the two legit holds; a payout path does
  **not** reconcile *afterward*. **This pre-payout reconcile is NOT age-gated** — it reclaims
  every orphan outside the expected set immediately, regardless of age. That is safe (and
  necessary): once a wager is ACCEPTED/COMPLETED, `pending_id` is null and no counter/approve
  can place a new hold (counters need OPEN, and the approve that made it ACCEPTED already
  committed), so there is **no in-flight young hold to mistake for an orphan** — every hold
  outside `{held_ref, accept_ref}` is a genuine strand. Age-gating here would instead let a
  *young* strand (a failed [B]/compensation) survive the payout into SETTLED, where nothing
  ever rescans it → stranded forever; the immediate pre-payout reconcile closes that window.
  *(Impl note: this adds a `/internal/holds` call + any refunds to the settle/confirm paths,
  which already hold the row lock across the `payout` wallet HTTP today — same shape, no new
  deadlock risk (the wallet locks another service's rows), but size those paths' wallet
  timeouts accordingly. The M1 `lock_timeout` applies to the counter/approve re-lock, not
  these settle paths.)*
- the scheduler `/internal/tick` in contests as a periodic backstop, over **every non-SETTLED
  wager that still has an outstanding hold** — OPEN / ACCEPTED / COMPLETED **and the
  terminal-but-not-settled states DECLINED / CANCELLED / REFUNDED** (expected set `{}` for the
  terminal ones). This last is **required**, not optional: because the per-transition
  reconcile above is *age-gated*, a **young** orphan present when a wager goes terminal
  (e.g. a best-effort [B] or a step-4 compensation that failed just before a decline) is
  skipped at that moment; without rescanning terminal states it would strand forever. The
  backstop rescans it and reclaims it once it ages past `RECONCILE_MIN_AGE`. (Never scan
  SETTLED — its two holds are consumed by the payout and would false-positive as orphans.
  Bound cost by only scanning wagers the wallet still reports an outstanding hold for; a
  fully-reconciled terminal wager drops out of the scan.)

It cannot create money: the only credits it issues are against holds genuinely outstanding,
outside the wager's obligation, **and older than `RECONCILE_MIN_AGE`**, each at most once
(all refunds of one orphan share its `(user, ref)` and dedup).

## Notifications

A counter notifies the **other party** (the new `pending_id`): template
`wager_countered`, e.g. *"Marcus countered your bet — $20 → $15,"* with a
**round-varying `dedup_key`** `wager_countered:{id}:r{n}` (n = the new `stake_round`).
`dedup_key` is a **permanent `unique=True` constraint** on both `Notification` and
`Message` (not a time window), so a fixed key would suppress every counter after the
first **forever** — the per-round key is mandatory, and `n` must genuinely vary each
round (it does: it's the monotonic `stake_round`). Reuses the best-effort `_notify`
fan-out and the `/c/<code>` deep link. **Approve/decline notifications must target
`held_id`** (the waiting party) — not a hard-coded `proposer_id`, which (when the
acceptor countered last) would fire the notice at the actor instead of the person
waiting on it.

## Edge cases

- **Insufficient funds on counter** → the counter-er's `hold` 402s **first** (the
  wallet raises `InsufficientFunds` before any commit), before any refund, so the offer
  is unchanged (hold-first ordering; no cross-service atomicity needed).
- **Crash / timeout mid-counter** → covered by *Recovery & reconciliation*: the hold
  precedes the row commit (so `held_id` is never left refunded-but-named), the outgoing
  refund is deferred and the reconciler reclaims any orphan at its own ref (dedup, no
  double credit), and an idempotent retry completes the row. Never a lost stake, never a
  created credit, never an underfunded ACCEPTED wager.
- **Kickoff passes mid-negotiation** → the "game started" cutoff rejects counter and
  approve just as it rejects a late accept today; the scheduler's open-offer expiry then
  refunds the current **`held_id`** at `held_ref` and cancels.
- **Concurrent / retried counter** → the `stake_round` snapshot + the three-case re-check
  under the re-lock (*Locking* step 4) lets exactly one commit win. A **retry whose own
  counter already committed** returns idempotent success (its live hold is left alone); a
  request whose hold is **genuinely orphaned** (status left OPEN, or the committed row
  doesn't name it) is compensated at its own ref and gets "no longer your turn." Only
  pending_id can counter, so the "loser" is a stale sibling request or a terminal/expiry
  path, never a different member.
- **Counter vs. approve race (same `pending_id` fires both)** → each holds at a **disjoint,
  per-attempt** ref (`wager:{id}:r{n}:{nonce}` vs `wager:{id}:accept:{nonce}`), so neither
  dedups onto the other and no live hold is ever released (the fifth audit's CRITICAL).
  Whichever commits [C] first wins: if approve wins (ACCEPTED), the losing counter's re-lock
  sees its ref is not the stored `held_ref` → compensates its own hold; if the counter wins,
  the losing approve's re-lock sees `stake_round` advanced → compensates its own hold. The
  reconciler backstops either compensation at the same ref (dedup).
- **Idempotency (why the ref scheme exists).** The wallet dedups on
  `(account, user, ref, type)` and moves no money on a repeat. A negotiation reuses one
  wager, so holds recur for the same users — a fixed ref would silently no-op (someone who
  held $20 at the base ref then counters would dedup to it and be charged nothing) **or**,
  worse, let a re-attempt dedup onto an already-reclaimed hold. So each attempt's hold uses
  a **fresh-`nonce`** ref; the row stores the exact `held_ref`/`accept_ref`; every refund of
  a stake uses that stake's own stored ref, shared by the inline best-effort refund, the
  step-4 compensation, and the reconciler (so they dedup rather than double-pay). `settle`'s
  payout (distinct `WAGER_PAYOUT` type at base) never collides with any hold or refund.
- **`/c/<code>` when it's the proposer's turn** → backend gates on `pending_id`; **and
  the webui link page must follow** (see UI) — the current page hard-codes acceptor and
  would show the proposer no buttons.
- **`$0` bragging bets** → skip bounds; hold/refund are no-ops (as today), so a counter
  just flips `pending_id` and bumps `stake_round`. `my_turn`/buttons still gate on
  `pending_id`.
- **Account deletion** while a counter is pending → `purge_user`'s OPEN branch refunds
  **`held_id`** at `held_ref` then cancels; the reconciler mops any orphan.
- **Min/max changed by the commissioner** mid-negotiation → each counter re-validates
  against current bounds.

## Invariants

- **One stake at rest while OPEN, two while ACCEPTED:** an idle OPEN wager holds exactly
  the `held_id`'s stake; a counter holds the newcomer's stake *before* the row commit and
  the outgoing stake is released after, so two are held transiently — the reconciler
  converges back to one. Approval adds the approver's stake at `accept_ref` and moves to
  ACCEPTED, where two stakes (`held_id` + approver) are held at rest until settle/void.
- **Conservation** (per `BETTING_MONEY_FLOW.md`) holds every round: `held_id` is always
  genuinely held (hold-before-commit), each stake's refunds share one ref (so no path
  double-credits), and a declined/withdrawn/expired negotiation returns the single held
  stake in full while the reconciler reclaims any orphan.
- **One terminal move per wager** once ACCEPTED: every payout site (`settle_one`,
  `_settle_due` COMPLETED, `confirm`, `purge_user` COMPLETED) reconciles then pays out at the
  base ref (distinct `WAGER_PAYOUT` type, consuming both holds); `void`, `approve_cancel`, and
  every push-refund return each party at its real held ref (`held_ref` / `accept_ref`) then
  reconcile. **No payout site reconciles afterward**, and the reconciler never runs on a
  SETTLED wager.

## UI (webui)

Board-grid states already mocked (`.html/counter-offer-flow.html`):
1. Incoming challenge → **Reject · Counter · Accept**.
2. Counter editor → line stepper (½-point, caller-perspective) + stake chips, live
   `was → now` delta.
3. Waiting on them → board card, "your stake held", **Withdraw**, history strip.
4. Their counter back → **Decline · Counter · Approve**, full history.

Buttons are driven by the new `my_turn` / `held_id`: your turn ⇒ Approve/Counter/
Decline; waiting ⇒ Withdraw. `negotiation` feeds the history strip.

**Public `/c/<code>` link page (M3 — must change, was omitted before).**
`web/app/(public)/c/[code]/page.tsx` currently gates the whole action UI on
`rel === 'acceptor'` (`canAct`, the `backed` pick highlight, the "sent you a bet"
heading, and a proposer dead-end "waiting on your opponent" with no buttons). Drive it
off `my_turn` instead: show Accept/Decline to whoever's turn it is, set `backed` and the
heading from the **viewer's** side, and drop the proposer dead-end when it's the
proposer's turn. `web/lib/invites.ts` `BetCodePreview` and `resolve_code`'s
`relationship` must carry `my_turn` (and the viewer's side) rather than only
acceptor/proposer/other. Still **no Counter over the link** in v1 — Accept/Decline only.

## Not in v1

- Countering the **side** or **market** (that's a new bet — reject with a hint).
- A per-round expiry / auto-decline timer.
- Counter on **field-sport** matchup bets (golf/racing) — disabled with the sports.
