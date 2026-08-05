# Head-to-Head (H2H) Wagers — Gap-to-Ship Build Plan

> **Scope.** Peer-to-peer, even-money wagers between two members of a
> `head_to_head` league. Owned by **`contests`** (the wager domain) +
> **`wallet`** (the play-money ledger), with **`ingestor`** supplying
> games/scores and the `scheduler` driving settlement. Sibling doc:
> [`PICKEM_BUILD_PLAN.md`](./PICKEM_BUILD_PLAN.md). The league container itself
> (`head_to_head` type, membership, periods, feed) lives in `leagues` and is
> shared with Pick'em.

- **Services / prefixes:** `contests` → `/v1/gameplay/contests`; `wallet` →
  `/v1/gameplay/wallet`. Both Postgres schemas of their own name.
- **Money is play-money credits** — every account is `league:{uuid}`, funded
  only by a commissioner grant on join. **There is no real money and no global
  balance** (`wallet/app/models/balance.py`).
- **Settlement engine:** scheduler `POST`s `/internal/tick` → `settle_due()`
  under a Postgres advisory lock (`service_wagers.py`).

---

## 1. How an H2H wager works today (end-to-end)

1. **Propose** (`propose` / `propose_many`, `POST /wagers`): a member offers a
   bet to one or more co-members on one event — `bet_type`
   (`moneyline` / `spread` / `total`), a `line` (spread/total), and
   `amount_cents`. `_validate_context` requires the league to be `head_to_head`,
   ACTIVE, the period OPEN, the stake within min/max, and the proposer allowed by
   the `who_can_propose` rule. The wager is created `open`, a `/c/B<code>` link is
   minted **in the same transaction**, and the proposer's stake is **held**
   (negative `wager_hold` txn). A **bet card is posted into the two players'
   DM** (`_post_bet_dm` → messaging) and the acceptor is notified.
2. **Accept** (`accept`, or `/c/<code>/act`): acceptor's stake is held → wager
   `accepted`. Collapsed "accepted" feed activity + proposer notified.
   Alternatively **decline** (refund proposer → `declined`) or the proposer
   **cancels** an open offer >10 min pre-game (`cancel` → `cancelled`, refund).
3. **In play:** both stakes are held (debited from balances). An accepted wager
   can be mutually cancelled: one side `request_cancel`, the other
   `approve_cancel` (refund both) or `reject_cancel`.
4. **Settle** (scheduler tick → `settle_due` → `settle_one`): refresh the event
   from ingestor; once `final`, `_resolve_outcome` computes
   `proposer | acceptor | push | None` from the final score (moneyline by winner,
   spread applies `line`, total compares combined vs `line`). Winner is
   **paid `amount × 2`** → `settled`; a push refunds both → `refunded`; a
   cancelled/unreadable/never-final-and-long-past event **void-refunds** both.
5. **Expiry:** open offers whose game has kicked off are auto-expired by the tick
   (refund proposer → `cancelled`).

Idempotency is enforced end-to-end by the wallet's
`uq_txn_idem (account, user_id, ref, type)` unique constraint, so re-running the
tick never double-pays.

**This core loop works and is money-safe.** The gaps are about dead legacy
state, the unused odds feed, dispute handling, funding UX, and — the big one —
**what "money" means for launch.**

---

## 2. Current-state audit

### Solid / done
- Even-money hold → settle → payout/refund with strict ledger idempotency and
  row-level locking (`service_wallet.py` `_locked_balance` + `_committed`).
- Rollback safety on propose: insufficient funds rolls back the whole wager so no
  funded-but-linkless or linkless-but-funded wager can exist.
- Score-based auto-grading for moneyline / spread / total, incl. push and
  void-refund fallbacks with a 6h grace window.
- Mutual-cancel protocol with a 10-min pre-game lock.
- $0 "bragging rights" wagers (loser-buys-a-beer) bypass min/max.
- Bet cards in DMs with inline Accept/Reject (`messages-sheet.tsx` `BetSlip`),
  plus `/c/B<code>` deep-link accept/decline and notifications.
- Grouping of sibling wagers (same game/pick offered to many members) into one FE
  card (`groupWagers`).

### Gaps (what blocks "ship")

| # | Gap | Evidence | Severity |
|---|-----|----------|----------|
| **B0** | **Play-money vs. real-money is undecided — and it gates everything.** The whole ledger is play credits granted by a commissioner. Whether Waygerz ever settles *real* money is a product + **legal/regulatory** decision (state-by-state wagering law, KYC, AML, payments) that dwarfs every other item here. | `balance.py` "no global balance"; grants only | **Blocker / decision** |
| B1 | **Legacy `completed` / `confirm()` / `confirmed` are dead weight.** Auto-settle pays the score-decided winner directly; the winner-confirmation path is vestigial but still in the model, service, API (`/wagers/<id>/confirm`), and FE (treats `completed` as "active"). Live tension: two payout paths, one dead. | `service_wagers.py:944,1042`; `wagersApi.confirm` | High |
| B2 | **Odds are ingested but never used.** `event.odds` (moneyline/spread/total from The Odds API) is display-only; every wager is strictly even-money regardless of the line's real price. No vig, no odds-based payout. | grep: contests never reads `event.odds` | High / decision |
| B3 | **No dispute / manual-override path.** If ingestor never reports `final` (or reports a wrong score), the only outcome is a 6h-grace void-refund. No commissioner/admin "grade this wager" or dispute flow. The old peer-concession model was removed. | `settle_one` void fallback | High |
| B4 | **No user-facing funding / top-up.** Money enters only via `/internal/grant` (commissioner-on-join). A member who busts their `league:{id}` balance can't re-buy-in; a commissioner has no UI to grant more. | wallet has no `/admin/*` | Medium |
| B5 | **`sport_league_id` scope is soft.** Cross-sport bet scoping is not enforced pending the ingestor `sport_leagues` catalog. | `service_wagers.py:363` | Medium |
| B6 | **Parimutuel "pools" fully dropped.** Migrations added then dropped `pools`/`pool_stakes`; only even-money H2H remains. Note so it isn't accidentally resurrected half-way. | `*_pools` / `*_drop_pools` migrations | Low/context |
| B7 | **Line/side snapshot can drift from reality.** The wager snapshots teams/`line`/`start_time` at propose time; if the ingestor later corrects an event, the wager keeps stale strings. Grading uses live score, but the *displayed* line may mismatch. | denormalized event fields | Low |
| B8 | **No settlement receipt / history surface.** Transactions exist per account, but there's no "here's how this bet paid out and why" view tied to the wager result. | `wallet/me/transactions` only | Low |

---

## 3. Phased build plan

### Phase 0 — Decisions (B0 first; nothing ships without it)
- **B0 — money model.** Pick one for launch:
  - **(a) Play-money only** (recommended for launch): keep credits, make it
    explicit in-product and in Terms that no real money changes hands. Fast,
    low-legal-risk, unblocks everything below. *This is almost certainly the
    launch answer given the current architecture and the pending legal review.*
  - **(b) Real money:** requires a payments processor, KYC/AML, state-by-state
    licensing/geofencing, responsible-gaming controls, and counsel sign-off —
    a program, not a feature. Out of scope for near-term launch.
  - **Recommendation:** ship **(a)**, and write the ledger/UX so a future (b)
    doesn't require re-architecting the wager engine (it won't — the even-money
    hold/settle model is money-model-agnostic).
- **B2 — odds model.** Even-money only for launch (simplest, already built), or
  odds-based payouts (vig, non-even stakes)? **Recommend even-money for launch**;
  surface the real line from `event.odds` as *context* on the bet slip without
  changing payout. Revisit odds-based pricing post-launch.

### Phase 1 — Kill the legacy path (correctness + clarity)
- **B1:** Remove the vestigial confirmation flow now that auto-settle is the
  live path:
  - Backend: drop the `confirm()` service fn, the `/wagers/<id>/confirm` route,
    and stop routing through `completed`; `settle_one` already moves
    `accepted → settled` directly. Keep `completed` as a tolerated legacy value
    only for any rows still in it (the tick already drains them), then plan a
    data migration to retire it.
  - FE: remove `wagersApi.confirm` and the "completed = active" handling; map any
    residual `completed` to the settled/active display via the live result.
  - Tests: assert no wager reaches `settled` via `confirm`; all via `settle_one`.

### Phase 2 — Trust & recoverability (the money-safety finish line)
- **B3:** Dispute / override path:
  - Commissioner (or internal admin) `POST /wagers/<id>/grade` with an explicit
    outcome (`proposer|acceptor|push|void`), guarded and audited, for events the
    ingestor can't resolve. Reuses the existing payout/refund helpers so ledger
    idempotency holds.
  - A "report a problem" affordance on a settled/void wager that flags it for
    commissioner review.
  - Widen/clarify the 6h void grace and notify both parties when a wager
    void-refunds ("<game> didn't finish / was cancelled — your stake was
    returned").
- **B4:** Funding UX:
  - Commissioner "grant credits" action (thin UI over the existing
    `/internal/grant`) with a wallet `/admin/grant` or leagues-mediated call +
    audit.
  - Optional per-league re-buy-in rule in `league.rules`.
- Settlement notifications: "You won <game> (+$X)" / "Push — stake returned" for
  both parties, opt-out-aware.

### Phase 3 — Polish + hardening
- **B5:** Enforce `sport_league_id` scope once the ingestor `sport_leagues`
  catalog lands (flip the soft check to hard).
- **B7:** Re-snapshot or reconcile the wager's displayed line/teams against the
  live event at render time (grading already uses live score).
- **B8:** Settlement receipt view tied to each wager (outcome + the two ledger
  entries), reachable from the bet card and `/c/<code>` page.
- **B6:** Confirm pools stay retired; remove any residual FE/union references.
- Edge cases: proposer or acceptor leaves the league mid-wager; league archived
  with open/accepted wagers (define: force-void-refund on archive?); event
  postponed then rescheduled.

---

## 4. Mobile (Flutter iOS + Android)

The native app consumes the **same `contests` + `wallet` API**. Constraints:

- **Bet-in-DM is a native feature, not web-only.** The `kind:"bet"` message +
  `BetSlip` card with inline Accept/Reject (`messages-sheet.tsx`) must be
  reproduced in the Flutter messaging thread; keep the message `meta` snapshot
  rich enough to render the card offline/without a second fetch (it already is).
  Per project rule, **in-thread bets go to the DM between the two players +
  notifications only — never the league group chat.**
- **Propose flow parity:** the propose UI currently lives only in
  `leagues/[id]/sections.tsx`; the native app needs the same propose →
  hold → notify path against `POST /wagers`.
- **Deep links:** `/c/B<code>` bet links must resolve as universal / app links
  into a native accept/decline preview mirroring `(public)/c/[code]`.
- **Push settlement/accept notifications** (APNs/FCM) — the accept, decline, and
  settle events should reach native push, dependent on the notifications
  service's device-token work.
- Native sends `Authorization: Bearer` (`X-Client-Type: mobile`); every wager /
  wallet endpoint already verifies `cookies` + `headers`.

_No mobile build work is scheduled here_ — these keep the API/data shapes
mobile-ready.

---

## 5. Launch checklist (H2H slice)
- [ ] **B0 money model decided** (recommend play-money) and reflected in Terms +
      in-product copy.
- [ ] **B2 odds model decided** (recommend even-money; show real line as context).
- [ ] Legacy `confirm`/`completed` path removed; single settle path (B1).
- [ ] Dispute / manual-grade + void notifications (B3).
- [ ] Commissioner funding / re-buy-in (B4).
- [ ] Settlement + accept/decline notifications, opt-out-aware.
- [ ] Archive-with-open-wagers behavior defined and implemented.
- [ ] Mobile: bet-in-DM, propose, `/c/B<code>` deep links, push all API-ready.
- [ ] Ledger idempotency regression (double-tick, concurrent settle) green.
