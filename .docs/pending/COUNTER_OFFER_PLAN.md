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
- **Money:** to counter, the system **holds the counter-er's new stake first** (a
  failed hold 402s cleanly, offer untouched), **then** refunds the outgoing holder.
  Approval holds the other side's stake and the bet goes live. At rest exactly one
  stake is held; a counter is the only moment two are held, and only for the instant
  between the two wallet calls (see *Idempotency & ordering*).

> **Audited 2026-09-04** (findings folded in). The wallet is a **separate service**,
> so a refund + a hold **cannot** share a DB transaction — this drove the hold-first
> ordering and the per-round ref scheme below. Do not restore "atomic refund-then-hold."

## Model

Rather than spawn a new wager per round (which would scramble the proposer/side
framing), negotiation happens **in place** on the one wager row, tracked by two ids
plus the live terms:

New `wagers` columns:

| Column | Meaning |
|---|---|
| `held_id` (uuid, nullable) | the member whose stake is **currently held**. Initially the proposer. |
| `pending_id` (uuid, nullable) | the member whose **turn** it is to approve / counter / decline. Initially the acceptor. `null` once the wager leaves negotiation. |
| `negotiation` (jsonb, default `[]`) | append-only round log: `[{by, amount_cents, line, at}]`, for the history strip and audit. |

`amount_cents` and `line` continue to hold the **current** proposed terms (updated in
place each round). `proposer_id`, `acceptor_id`, `proposer_side`, `bet_type`,
`event_id` are immutable for the life of the wager.

**Migration / back-compat:** existing rows get `held_id = proposer_id`,
`pending_id = (status = 'open' ? acceptor_id : null)`, `negotiation = []`. Code
defaults mirror this so old rows behave exactly as today.

## State & money, per action

All actions require `status = OPEN` and `_lock` the row + re-check status /
`pending_id` under the lock (as accept/settle do today). Amounts re-validate against
the league's min/max (a `$0` bragging bet skips bounds); a spread/total line must be
present and numeric. **Timing guards match today's per-action semantics:** *approve*
uses only the "game already started" cutoff (as `accept` does now — accept has **no**
10-minute lock); *withdraw* keeps `cancel`'s `CANCEL_LOCK_SECONDS` lock; *counter*
uses the started cutoff (like accept) so you can renegotiate up to kickoff.

| Action | Who | Money move | Result |
|---|---|---|---|
| **Propose** (today) | proposer | `hold(proposer, stake)` | OPEN · held=proposer · pending=acceptor |
| **Counter** | the `pending_id` member (must ≠ `held_id`) | `hold(counterer, new_stake)` **then** `refund(held_id)` | OPEN · held=counterer · pending=other party · terms updated · round appended |
| **Approve** | the `pending_id` member | `hold(pending_id, stake)` → both held | ACCEPTED · pending=null (this is `accept`, generalized) |
| **Decline** | the `pending_id` member | `refund(held_id)` | DECLINED |
| **Withdraw** | the `held_id` member (the one waiting) | `refund(held_id)` | CANCELLED |

Key point: **the wallet is a separate service — contests can't wrap a refund and a
hold in one transaction.** So a counter **holds the counter-er first**: if they lack
funds it 402s before anything moves and the standing offer is untouched; only after
the hold succeeds do we refund the outgoing holder (idempotent, retriable). Both
stakes are briefly held during a counter — the accepted trade-off for money-safety
across the boundary.

Existing paths are **generalized** to operate on `held_id` / `pending_id` instead of
hard-coded `acceptor` / `proposer`:
- `accept` → holds `pending_id` (was: acceptor), sets ACCEPTED, `pending_id = null`.
- `decline` → refunds `held_id` (was: proposer).
- `cancel` (withdraw) → refunds `held_id`, allowed only for `held_id` (was: proposer).
- **scheduler open-offer expiry** (`_settle_due`) and **`purge_user`'s OPEN branch**
  both refund the single staker — change both from `proposer_id` to `held_id`
  (else a wager the acceptor countered last refunds the wrong person).

Because a freshly proposed wager has `held_id = proposer`, `pending_id = acceptor`,
today's behavior is the zero-round case of the same rules.

## API

- `POST /v1/gameplay/contests/wagers/{id}/counter` — body `{ amount_cents, line? }`.
  Guard: caller `== pending_id`, caller `!= held_id`, status OPEN, lock/started
  checks, bounds/line validation. Does the refund-then-hold, updates terms, appends
  the round, flips `pending_id`, notifies the other party.
- **Approve** is the existing `POST …/wagers/{id}/accept` (now identity-generalized) —
  no new endpoint.
- **Withdraw** is the existing `…/wagers/{id}/cancel`.
- **`/c/<code>` link:** today `resolve_code` / `act_on_code` gate actions on the caller
  being the **acceptor** — which breaks when it's the *proposer's* turn. Both must key
  off `pending_id` (offer Accept/Decline to whoever's turn it is). **No counter action
  over the link** in v1 — countering is in-app; the link stays Accept/Decline.
- `GET …/wagers/{id}` and the list already return the wager; add `held_id`,
  `pending_id`, `negotiation`, and a derived `my_turn` (`pending_id == me`) to
  `to_dict()` so the UI can render the right buttons.

## Notifications

A counter notifies the **other party** (the new `pending_id`): template
`wager_countered`, e.g. *"Marcus countered your bet — $20 → $15,"* with a
**round-varying `dedup_key`** (`wager_countered:{id}:r{n}`) so later rounds aren't
suppressed by the notifications service's dedup. Reuses the best-effort `_notify`
fan-out and the `/c/<code>` deep link. **Approve/decline notifications must target
`held_id`** (the waiting party) — not a hard-coded `proposer_id`, which (when the
acceptor countered last) would fire the notice at the actor instead of the person
waiting on it.

## Edge cases

- **Insufficient funds on counter** → the counter-er's `hold` 402s **first**, before
  any refund, so the offer is unchanged (hold-first ordering; no cross-service
  atomicity needed).
- **Kickoff passes mid-negotiation** → the "game started" cutoff rejects counter and
  approve just as it rejects a late accept today; the scheduler's open-offer expiry
  then refunds the current **`held_id`** and cancels.
- **Both parties race** → the row `_lock` + `status`/`pending_id` re-check under the
  lock lets exactly one win; the other gets "no longer your turn."
- **Idempotency & ordering (load-bearing).** The wallet dedups on
  `(account, user, ref, type)` and moves no money on a repeat. A negotiation reuses
  one wager, so holds/refunds recur for the same users — a fixed ref would silently
  no-op (someone who held $20 at r0 then counters to $10 dedupes to the r0 hold and is
  charged nothing; refunds collide the same way). **Scheme:** every `hold` and every
  negotiation `refund` uses a **per-round ref `wager:{id}:r{n}`** (n increments on each
  stake move — propose, each counter, approval). **Terminal moves stay on the base ref
  `wager:{id}`:** `settle`'s `payout` (distinct `type`, never collides) and
  `_void_refund`'s two base-ref refunds (base ≠ any `r{n}`), each crediting the final
  `amount`. A wallet/contests change beyond the feature itself.
- **`/c/<code>` when it's the proposer's turn** → `resolve_code`/`act_on_code` gate on
  the acceptor today; both must key off `pending_id`. No counter over the link in v1.
- **Lock duration** → `_lock` is held across counter's **two** synchronous wallet
  calls (accept already holds it across one). Acceptable; hold-first ordering ensures
  a crash mid-counter leaves at worst a momentary extra hold, never a lost stake.
- **`$0` bragging bets** → skip bounds; hold/refund are no-ops (as today), so a counter
  just flips `pending_id`.
- **Account deletion** while a counter is pending → `purge_user`'s OPEN branch refunds
  **`held_id`** (not always the proposer) then cancels.
- **Min/max changed by the commissioner** mid-negotiation → each counter re-validates
  against current bounds.

## Invariants

- **One stake at rest, two only momentarily:** while `status = OPEN` and idle, exactly
  one stake (the `held_id`'s) is held. During a counter the counter-er's stake is held
  *before* the outgoing stake is refunded, so two are held for the instant between the
  two wallet calls — the accepted price of money-safety across the non-atomic wallet
  boundary. Approval holds the second stake and transitions to ACCEPTED.
- **Conservation** (per `BETTING_MONEY_FLOW.md`) holds every round: a refund always
  precedes the new hold, so credits are never created; a declined/withdrawn/expired
  negotiation returns the single held stake in full.
- **One terminal move per wager** is unchanged once ACCEPTED — normal settle/void.

## UI (webui)

Board-grid states already mocked (`.html/counter-offer-flow.html`):
1. Incoming challenge → **Reject · Counter · Accept**.
2. Counter editor → line stepper (½-point) + stake chips, live `was → now` delta.
3. Waiting on them → board card, "your stake held", **Withdraw**, history strip.
4. Their counter back → **Decline · Counter · Approve**, full history.

Buttons are driven by the new `my_turn` / `held_id`: your turn ⇒ Approve/Counter/
Decline; waiting ⇒ Withdraw. `negotiation` feeds the history strip.

## Not in v1

- Countering the **side** or **market** (that's a new bet — reject with a hint).
- A per-round expiry / auto-decline timer.
- Counter on **field-sport** matchup bets (golf/racing) — disabled with the sports.
