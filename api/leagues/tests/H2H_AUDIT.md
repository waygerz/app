# Head-to-Head — End-to-End Audit

**Date:** 2026-07-17 · **Scope:** `leagues`, `contests`, `wallet`, `ingestor`, `scheduler`, `gateway`, `webui`

## TL;DR

**H2H is ~90% written and 0% functional. It is broken in production right now, at
the very first step, by two one-line bugs — and the test suite cannot see either
because it mocks over both.**

The *design* is complete and mostly good: create → grant credits → propose →
accept → sweep marks `completed` → peer-confirm → payout → standings. Every seam
is wired, the gateway routes it, the scheduler drives it, the API surface is
complete, the frontend is complete (three accept/decline entry points, zero dead
code), and the wallet underneath is production-grade. **This is not a build-out
job.** It is a small number of precise fixes.

Ranked:

1. **A0 — `propose()` fails 100% of the time in production.** `contests` doubles the ingestor URL prefix; `get_event` 404s for every event. *Verified live against prod (§A0). No wager can be created at all.* The identical bug was found and fixed in `leagues` on 2026-07-13 (`e0d98089`) and never ported.
2. **A0b — `_likely_over` always raises `NameError`** (`timedelta` unimported), silently swallowed; wagers strand in `accepted` forever with both stakes debited.
3. **A1 — either party can take the pot**, sometimes *before kickoff*.
4. **A2 — one click permanently bricks a season league** (the default config), behind misleading copy.
5. **A3 — ATS bet type is collected, echoed to the user, and silently discarded.**
6. **D — no cross-service test anywhere in the money path**, which is exactly why 1 & 2 ship green.

H2H also "feels broken" relative to Pick'em for a second reason: it is the only
type that touches the wallet, and every wallet call in `leagues` is unguarded (§B2).

> **Correction to an earlier draft of this audit:** it claimed "the full loop works
> end to end today." That was wrong. Every *seam* matches (contract-checked by
> hand), but matching contracts is not a working system — the URL is built wrong
> at one call site, and only an actual request reveals it. §A0 was found by an
> independent reviewer and then proven against production.

---

## What is correctly *built* (don't rebuild these)

> **Read as "the code is right", not "it runs".** A0 breaks the chain at
> `propose()`, so nothing below it executes in production today. These are all
> contract-verified by hand, and the wallet layer is verified by real tests.

| Capability | Evidence |
|---|---|
| Create + validate money league | `leagues/app/services/service_leagues.py:501-562` |
| Starting balance granted, **idempotent** on rejoin | `service_leagues.py:270-279`, `:497`, `:560`; ref `league_grant:{id}` + `wallet/app/services/service_wallet.py:85-103` |
| Per-league ledger (`league:{id}` account) | `leagues/app/models/league.py:58-61`; wallet is the ledger, leagues owns none |
| Wager lifecycle `open→accepted→completed→settled` (+`declined`/`cancelled`/`refunded`) | `contests/app/models/wager.py:8-14` |
| Full public API (propose/accept/decline/cancel/confirm) | `contests/app/routes/route_wagers.py` |
| Stake holds debit immediately → **no double-spend** | `service_wallet.py:112` (`hold` posts a *negative* txn) + insufficient-funds check |
| Rule enforcement: type, active, open period, min/max, `who_can_propose` | `contests/app/services/service_wagers.py:150-168` |
| Sport scoping (league → context → enforcement) | `leagues/app/services/service_internal.py:45` → `service_wagers.py:191-194` |
| H2H **weekly** rollover (synthesizes next week) | `service_leagues.py:355-372` — explicitly handles "non-prebuilt leagues, e.g. head-to-head weekly" |
| H2H money standings (balance, net, W-L-P) | `service_leagues.py:835-856` ← `contests/app/services/service_internal.py:8` |
| League feed posts: accepted / ready-to-settle / settled | `service_wagers.py:247`, `:296`, `:362` |
| Frontend: propose dialog, 3× accept/decline entry points, balance, standings, history | `webui/.../sections.tsx:1227-1398`, `:596-605`, `bets/[filter]/page.tsx:82-88`, `notifications-sheet.tsx:104-115` |
| Gateway routes + scheduler ticks contests | `gateway/conf.d/default.conf:119`; `scheduler/scheduler.py:15` |

`lib/wagers.ts` has **zero dead code** — all 7 exports are called from components.

---

## A. Blockers — H2H is non-functional in production

### A0. `contests` doubles the ingestor prefix → every `propose()` dies
`contests/app/services/service_wagers.py:40-41`

```python
base = current_app.config["INGESTOR_URL"]
resp = requests.get(f"{base}/v1/platform/ingestor/events/{external_id}", timeout=10)
```

`INGESTOR_URL` **already carries** the prefix. Verified against the live ECS task
definition (`waygerz-contests:1`):

```
INTERNAL_INGESTOR_URL = https://waygerz.com/v1/platform/ingestor
```

(The in-code default `http://ingestor:8000` — `contests/app/utils/config.py:54` — has
no prefix and would make this line *correct*. It is a misleading fallback that
never applies: compose uses `env_file: .env`, and prod sets the prefixed value.
Note prod services call each other over the **public ALB**, not the compose network.)

**Proven against production** — the two URL shapes, same base:

| Built by | Result |
|---|---|
| `leagues` — `{base}/events/<id>` | **HTTP 500** ← route exists, handler reached (bogus id) |
| `contests` — `{base}/v1/platform/ingestor/events/<id>` | **HTTP 404** ← route does not exist |

So `get_event` returns `None` (`:42-43`) → `propose()` raises
`WagerError("event not found")` (`:185-186`) for **every wager**. Head-to-Head
cannot create a single bet.

This is not a new discovery — it's a **missed port**. Commit `e0d98089`
(2026-07-13) fixed the identical line in `leagues`:

> *"leagues: fix get_event — INGESTOR_URL already carries the `/v1/<group>/ingestor`
> prefix, so the old URL doubled it, 404'd, and pick'em grading never graded."*

`leagues/app/services/service_leagues.py:101-105` now reads `{base}/events/{id}`
with that comment. Contests never got the same fix (line 41 is still from
`4012002`, 2026-07-05). It is also **inconsistent with its own neighbour**:
`refresh_event` eight lines below (`:49-52`) correctly uses the bare
`{base}/internal/...`.

**Why nobody noticed:** `contests/tests/conftest.py:57-69` monkeypatches
`get_event` wholesale — no test ever builds the URL.

**Fix:** `f"{base}/events/{external_id}"`. One line.

### A0b. `timedelta` is not imported → `_likely_over` always raises
`contests/app/services/service_wagers.py:328`

```python
return dt + timedelta(hours=COMPLETE_AFTER_HOURS) <= datetime.utcnow()
```

Line 7 is `from datetime import datetime` — **no `timedelta`**. Guaranteed
`NameError`, and `settle_due` swallows it (`except Exception: continue`, `:442-444`),
so a wager whose event never reports `final` sits in `accepted` **forever** with
both stakes debited — and the log stays clean.

The entire `COMPLETE_AFTER_HOURS` fallback — the whole reason the constant
exists — is dead code that throws on first real use.

**Why no test catches it:** `:353` is `if status == "final" or _likely_over(wager)` —
`or` short-circuits, so `status="final"` tests never reach it. The one test that
would (`test_settle_noop_when_event_not_final:121`) uses `start_time: None`, which
returns at `:327` — one line *before* the bug. **No test in the suite sets a
non-null `start_time`.**

**Fix:** `from datetime import datetime, timedelta`. One line. Then add a test with
a real past `start_time`.

**These two compound:** with A0, `get_event` → `None` → `status = None` → falls
through to `_likely_over` → `NameError`.

---

## A. Critical — fix before anyone plays for real

### A1. Either party can take the pot — no dispute path, sometimes before kickoff
`contests/app/services/service_wagers.py:371-419`

```python
if result == "won":
    winner = user_id          # ← the caller simply declares themselves winner
...
payout(account, winner, wager.amount_cents * 2, _ref(wager.id))
```

The only guard is `wager.involves(user_id)` (`:380`). **The loser can claim `won`
and take 2× — first click wins.** The result is never checked against the
ingestor's `winner_side`, even though it is available (`leagues` already consumes
it at `service_leagues.py:293`). Grepped `dispute|override|arbitrat|contest_result`
across leagues+contests: **zero hits**. Test `test_confirm_won_pays_claimer_double`
(`test_wagers.py:128`) encodes this as intended behavior.

**Worse — the claim window opens at kickoff, not at the final whistle** (`:384`):

```python
elif wager.status == ACCEPTED and _has_started(wager):   # claimable mid-game
```

**Worst — unknown start time is treated as "started"** (`:314-316`):

```python
def _has_started(wager) -> bool:
    dt = _parse_start(wager)
    return dt is None or dt <= datetime.utcnow()   # ← None ⇒ True
```

Note the **inverted safe-default between two adjacent functions**: `_likely_over`
deliberately returns `False` on unknown start (*"we won't declare an event 'over'
when we can't tell"*, `:319-328`) while `_has_started` returns `True`. So for a
TBD-time game — nullable in the ingestor (`ingestor/app/models/event.py:36`, emitted
as `None` at `:71`) and still `status == "scheduled"`, so it passes propose
validation — **the pot is claimable the instant the wager is accepted, before the
game is played.**

**Fix options** (pick per product intent):
- Auto-settle from `winner_side` when data is final; peer-confirm only as fallback for missing data.
- Require *both* sides to confirm, or the **loser** to concede; a self-claimed `won` opens a dispute window rather than paying instantly.
- Minimum: flip `_has_started` to return `False` on unknown start, and disallow confirm from `ACCEPTED` (require the sweep's `COMPLETED`).

### A2. "Advance period" permanently bricks a season league — and season is the default
`service_leagues.py:1330-1359`

Sets the period `FINAL`, but the successor branch is **weekly-only** (`:1349`):

```python
if league.period_type == "weekly":
    ...  # opens the next period
# season → no successor is ever created
```

`current_period` then falls back to that FINAL period (`:164-172`), so
`league_context.period_status == "final"` and contests rejects **every** wager
with *"betting is closed for this period"* (`service_wagers.py:157`) — forever.

**No recovery exists:** `regenerate_periods` rejects non-pickem (`:389`),
`activate_league` requires `DRAFT` (`:692`).

**Reachability is the problem:**
- `season` is the **default** in the create form — `webui/app/(app)/leagues/new/page.tsx:36`.
- The button renders for **any** active league, ungated by type or period_type — `sections.tsx:1904-1915`.
- Its dialog **misdescribes the action**: *"Close the current period now and open the next?"* — for a season league there is no next.

(An untouched H2H season league is fine: create never sends `ends_at`, so
`ends_at` is `None` and `rollover_periods` skips it at `:343`, leaving the period
open indefinitely. The button is the *only* way in.)

**Fix:** hide/disable Advance Period for season leagues (or make it open a
successor season period), correct the dialog copy, and add a server-side guard.
Consider a commissioner "reopen period" escape hatch.

### A3. ATS bet type + spread are silently discarded — the UI lies
`webui/.../sections.tsx:1279`

```ts
bet_type: betType, line: betType === 'ats' ? Number(line) : null,
```

`contests/app/models/wager.py` has **no** `bet_type`/`line` column, and
`propose_wagers` (`service_wagers.py:466-489`) reads exactly five fields —
`league_id, acceptor_ids, event_id, side, amount_cents`. Grep for
`bet_type|line` across the contests model+service: **zero hits.**

The user picks "ATS −3.5", sees it echoed in the confirm line (`:1358`), submits —
and **both sides get a straight-up bet**. `Wager` in `wagers.ts:20-44` has no such
fields, so no card can ever reveal the substitution. This is worse than a missing
feature: the flow misreports what was wagered.

**Fix:** either drop the ATS toggle, or plumb it through model → migration →
`to_dict` → `Wager` type → cards → settlement logic (ATS changes who wins).

---

## B. High — money correctness & availability

### B1. Nothing ever expires — stakes can be held forever
- **`COMPLETED` never times out.** If neither party confirms, both stakes stay held indefinitely, silently distorting `balance_cents`/`net_cents`. `settle_one` deliberately declines to auto-pay (`:331-337`).
- **`OPEN` never expires.** `settle_due` queries `status=ACCEPTED` only (`:424`). An ignored proposal holds the proposer's stake forever, even long after the game ends.

Grepped `EXPIRE|expire|stale|timeout` in `contests/app/` → only `COMPLETE_AFTER_HOURS = 6` and HTTP timeouts. **Fix:** expire `OPEN` at kickoff (refund proposer); auto-settle or nudge+auto-resolve `COMPLETED` after N days.

### B2. A wallet blip returns HTTP 500 on core H2H pages
`wallet_account_balances` (`service_leagues.py:48-54`) calls `raise_for_status()`
with **no try/except** — unlike `contests_league_record` immediately below it
(`:57-66`), which degrades to `{}`. Callers: `_detail:462`, `my_leagues:578`,
`standings:836`. Grepped `errorhandler|register_error` in `leagues/app/` → **zero hits**.

Pick'em never touches the wallet — **this asymmetry is a large part of why H2H
"feels broken" and Pick'em doesn't.** Fix: mirror the `contests_league_record`
try/except and degrade to a "balance unavailable" state.

### B3. Grant failures are swallowed permanently
`service_leagues.py:278-279` prints and moves on. No retry, no reconciliation.
The member silently sits at 0 credits and cannot bet, with no surfaced error.
**Fix:** retry/reconcile job, or make balance lazily self-heal.

### B4. Leave / remove / archive ignore money entirely
`leave_league:1235-1245`, `remove_member:1248`, `archive_league:1318` just flip a
status field. No open-wager check, no refund, no settlement. A member with held
stakes vanishes from standings (`:833` filters `status == ACTIVE`) while their
money stays in the league account — **the pot silently stops reconciling.**
**Fix:** block leaving with open wagers, or auto-cancel+refund them.

---

## C. Medium — rules not mirrored client-side

Server enforces; client doesn't mirror, so violations fail late as per-acceptor
error toasts after the user completes the whole flow:

- **Min/max wager** — `configReady` (`sections.tsx:1295`) checks only `Number(credits) > 0`. `lg.min_wager_cents`/`max_wager_cents` are editable in Manage (`:1832-1841`) and shown on the invite page, but the propose dialog never reads them. Server: `service_wagers.py:161-165`.
- **`who_can_propose`** — written at `sections.tsx:1842`, **never read anywhere else** (2 grep hits, both in Manage). Non-commissioners in a locked league get the full flow, then a failure. Server: `:167-168`.
- **Balance** — `my_balance_cents` is on hand but unchecked; no total-exposure preview when multi-selecting N opponents (N × stake).

Also: **min/max wager are absent from the create form** — settable only after the
fact via Manage (`new/page.tsx` never sends them).

---

## D. Testing — the real structural gap

**No test anywhere exercises two services together in the money path.**

| Suite | Coverage | Blind spot |
|---|---|---|
| `contests/tests/test_wagers.py` | 20 tests, full lifecycle | **wallet ops are stubs** — `hold`/`payout`/`refund` monkeypatched to append tuples (`conftest.py:70-73`); `league_context` mocked (`:40-56`) |
| `wallet/tests/` | 9 tests, ledger + idempotency | ledger in isolation |
| `leagues/tests/` | `head_to_head` is the default fixture, but tests are generic CRUD/membership | `wallet_grant` stubbed to no-op (`conftest.py:64`) — **nothing asserts the grant happens, or with what args** |

The contests↔wallet and leagues↔contests contracts are **never tested together** —
a signature or semantics mismatch would pass every suite. (They line up *today*:
every op contests calls exists on the wallet side; verified by hand.)

The only positive H2H test in `leagues` is `test_pickem.py:202`
`test_money_league_standings_shape`, which mocks *both* cross-service calls.
**Zero tests** for: H2H activate period shape, `week_starts_on`, H2H rollover,
`grant_starting_balance`, `league_context`.

**This is not a coverage problem — it's a *seam* problem.** The 20 contests tests
are genuinely good at what they test (the state machine). But every boundary is
mocked, so the suite is structurally incapable of catching either blocker:

| Blocker | Why the suite is blind |
|---|---|
| **A0** (doubled URL) | `get_event` is monkeypatched wholesale — no test ever *builds* a URL |
| **A0b** (`NameError`) | `or` short-circuits past `_likely_over` when `status="final"`; the only test that reaches it passes `start_time: None`, returning one line *before* the bug |

Both would ship green forever. Note also that `test_confirm_won_pays_claimer_double`
(`:128`) doesn't just miss A1 — it **asserts A1 as correct behavior**.

**Recommendation:** an `H2H_E2E` mirroring `PICKEM_E2E.md` — drive propose → accept
→ event final → tick → confirm → payout → standings against a **real wallet** (same
Postgres, both schemas), stubbing **only** the ingestor *HTTP transport* (e.g.
`responses`/`requests-mock`), **not** `get_event` itself — so the URL is actually
constructed. That single test would have caught A0, A0b, A1, A3, B1, and B4.

Cheap complement: a contract test asserting every `{SERVICE}_URL` consumer builds
a path that the target service actually mounts. A0 is the second instance of this
exact bug in two weeks; the next one is a matter of time.

---

## E. Minor / notes

- **Sport scoping is soft by design** — `service_wagers.py:191-194` enforces only when *both* sides carry a catalog id ("soft until the ingestor sport_leagues catalog lands"). The catalog **has** landed (`ingestor/app/models/event.py:26`, populated at `service_events.py:138`), so this can likely be hardened — but it still silently degrades to "no restriction" when `catalog_id()` returns `None`.
- **`_period_final_body` is pickem-shaped but runs for H2H** (`:1012`, called from `:352`). For H2H it returns `None` (no picks) and falls back to generic text — no crash, but **an H2H week-final post can never name the week's money winner.**
- **`fetchWallet` (`wallet.ts:29`) is dead** — defined, never imported. (Balance comes from `lg.my_balance_cents` via `leagues.ts`, not the wallet client.)
- **Sports hub counts can understate** — `sections.tsx:668` derives from one `fetchUpcomingEvents(50)` (`:65`) shared across all of a league's sport-leagues; the 50-cap truncates with several competitions.
- **`notifications/` is fully dormant** — not in `docker-compose.yml`, not in the gateway, and referenced by neither `contests` nor `leagues` (grep → zero hits). H2H "ready to settle" nudges reach only the league feed + client-side bell.
- **`_prebuild_periods:230` stores `None`** — `existing[label] = p` where `p is None` (the new period is passed straight to `db.session.add()` unbound). Pick'em-only; harmless unless the ingestor emits duplicate week labels, which would then create duplicate periods.
- **`week_starts_on` is effectively H2H-weekly-only** — `service_leagues.py:708` is its single read; pickem-weekly short-circuits into `_prebuild_periods` (`:702`) and only reaches it if the ingestor week fetch fails. (This validates keeping the field for H2H weekly while hiding it for Pick'em.)
- **Multi-sport favors H2H** — pickem only ever uses the *first* sport (`_prebuild_periods:198-201`, "primary"); H2H honors the full list.
- **No lock-at-kickoff** — `accept()` (`service_wagers.py:261`) checks only `status == OPEN`, never `start_time`. `_has_started` exists but `accept` never calls it. A wager can be accepted mid-game.
- **Challenge invites are silent** — `propose()` posts no feed activity and no notification; only `accept()` does (`:242-258`). The acceptor learns of a challenge only by opening the app.
- **`/admin/settle` is dead** — `route_wagers.py:52`, guarded and wired to a controller, **zero callers** repo-wide. Duplicates `/internal/tick`.
- **Postponed = bet killed** — `ingestor/app/services/service_espn.py:103` maps `CANCEL|POSTPON|ABANDON` → `cancelled`, which auto-refunds both sides (`service_wagers.py:345-351`). Postponed games are usually *rescheduled*; product call.
- **`{base}/events/<bogus-id>` returns 500, not 404** (observed live). Minor, but a bad id shouldn't 500.

---

## F. Architecture note — `/internal/*` is internet-reachable (not H2H-specific)

`CLAUDE.md` and `gateway/conf.d/default.conf:100-101` both claim internal
endpoints are "private to the compose network" and "deliberately not routed by
the gateway." **In production this is false.**

The live task definitions point every service at the **public ALB**:

```
INTERNAL_WALLET_URL = https://waygerz.com/v1/gameplay/wallet
```

Since `f8c248d` mounted `/internal` *under* the public API prefix, internal routes
are reachable from the internet — and *must* be, for service-to-service calls to
work at all. Probed live:

```
POST https://waygerz.com/v1/gameplay/contests/internal/tick   (no token)  -> 403
POST https://waygerz.com/v1/gameplay/contests/internal/tick   (bad token) -> 403
```

403 from the app's `internal_only` guard — the route **exists** publicly, guarded
solely by `X-Internal-Token`.

**This is not an active vulnerability:** `INTERNAL_TOKEN` is a proper Secrets
Manager secret in prod (verified: it's in `secrets`, not `environment`), *not* the
`dev-internal-token` default. But it means a single shared token is the only thing
between the internet and `/internal/grant` — an arbitrary balance-minting
endpoint. Worth: (a) fixing the two stale doc claims, (b) considering ALB rules
that reject `/internal/*` from outside the VPC, so the token is defense-in-depth
rather than the sole control.

---

## Suggested order

**Ship first — ~10 minutes, unblocks everything:**
1. **A0** — one line. H2H literally cannot create a wager without it.
2. **A0b** — one line (`import timedelta`).
3. Add a test that would have caught each (real URL; non-null past `start_time`).

**Then — decide, don't just code:**
4. **A1** — money can be stolen. Cheapest partial: flip `_has_started` to `False` on unknown start, and require `COMPLETED` for confirm. The real fix is a product call (auto-settle from `winner_side`? two-sided confirm? commissioner override?).
5. **A3** — decide ATS: drop the toggle, or plumb it through (it changes who wins).
6. **A2** — one click, unrecoverable, on the *default* config, behind misleading copy.

**Then:**
7. **B2** — one try/except; removes the biggest "H2H is broken" symptom.
8. **B1 / B4** — stuck money; needs a product call on expiry semantics.
9. **D** — the H2H e2e test against a real wallet; would have caught A0, A0b, A1, A3, B1, B4.
10. **F / C / E** — doc + ALB hardening, client-side rule mirroring, polish.
