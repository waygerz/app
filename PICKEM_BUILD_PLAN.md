# Pick'em Leagues — Gap-to-Ship Build Plan

> **Scope.** Free (no-money) pick-the-winner leagues, owned entirely by the
> **`leagues`** service (`api/leagues/`). This doc audits what exists today and
> lays out a phased plan to production-ready. Its sibling is
> [`H2H_BUILD_PLAN.md`](./H2H_BUILD_PLAN.md) (money wagers, owned by `contests` +
> `wallet`); the two league types share one data model in `leagues`, so changes
> here that touch shared tables are cross-referenced there.

- **Service:** `leagues` — Postgres schema `leagues`, API prefix
  `/v1/gameplay/leagues`.
- **League type:** `League.PICKEM` (`api/leagues/app/models/league.py`). Pick'em
  is fully self-contained; no wallet, no contests, no money columns.
- **Lifecycle engine:** the poll-loop `scheduler` `POST`s `/internal/tick` every
  30s → `grade_open_periods()` → `rollover_periods()` → `_reannounce_winners()`
  (`service_internal.py`).

---

## 1. How a Pick'em league works today (end-to-end)

1. **Create** (`create_league`, `service_leagues.py`): commissioner names the
   league, picks `period_type` (`weekly` or `season`) and ≥1 sport. League is
   born **DRAFT**. A reusable `LeagueInviteCode` (`/c/L…`), the commissioner
   `LeagueMember`, the `LeagueSport` rows, and a `league_created` feed row are
   created.
2. **Invite / join**: friend invites (`invite_friends` → `LeagueInvite` PENDING +
   notification), the shareable `/c/<code>` link (`resolve_code` / `act_on_code`),
   and the in-app Invites inbox (`my_invites`). Joining upserts a `LeagueMember`.
3. **Activate** (`activate_league`): DRAFT → **ACTIVE**. Weekly Pick'em
   **prebuilds one `LeaguePeriod` per upcoming ingestor week** (`_prebuild_periods`)
   and opens the earliest (`_ensure_open_period`); season leagues get a single
   OPEN period.
4. **Pick** (`submit_picks`, PUT): members choose `home`/`away` per game in the
   OPEN period, plus an integer **tiebreaker** on the week's last game. Games that
   have already kicked off are skipped server-side; the FE hides/locks the whole
   slate **1 hour before the first game**.
5. **Grade** (scheduler tick): `grade_period` marks each pick `correct` once its
   event is `final` (tie / void → `correct=False`). Grading keys off
   `correct IS NULL`, so late-finishing games still grade after rollover.
6. **Roll over** (scheduler tick): an OPEN period past `ends_at` → **FINAL**, a
   `period_final` feed post with the 🏆 winner line, and the next prebuilt week
   opens. `_period_leaderboard` ranks by correct-pick count, ties broken by
   tiebreaker distance to the last game's combined score.
7. **Results / standings**: `period_results` (weekly leaderboard + confirm flags),
   `standings` (season-long wins/losses), commissioner `confirm_member`
   green-checks.

**This core loop works.** The gaps below are about lifecycle completeness,
consistency of the lock model, notifications, and finish-line polish — not a
broken engine.

---

## 2. Scheduling & liveness (verified in code)

Two tick chains, both driven by the poll-loop `scheduler` every **30s**, do the
real work. This section records how they behave today and what was hardened.

### Closing the week — ✅ scheduled & automatic
- `scheduler.py` → `leagues /internal/tick` → **`rollover_periods()`**
  (`service_leagues.py`): any **OPEN** period with `ends_at <= now` flips to
  **FINAL**, writes the `period_final` feed post, and (weekly + ACTIVE) opens the
  next prebuilt period.
- The close time is the **real schedule**: `_prebuild_periods` seeds each period's
  `ends_at` from the ingestor week list (`/schedule/by-catalog/{id}/weeks`) at
  activation.
- Grading is **decoupled** from close (`grade_open_periods` keys off pending
  picks, not period status), so a game that finals *after* rollover still grades.

### Live game status — ✅ ~60s in-game, from ESPN
- `scheduler.py` → `ingestor /internal/tick` → **`refresh_scores`** per league,
  TTL-gated by `has_live_window` (a LIVE event, or a SCHEDULED one within
  `now-6h … now+15m`): **`SCHEDULE_SCORE_TTL_LIVE` = 60s** in-game,
  **`SCHEDULE_SCORE_TTL_IDLE` = 900s** idle. Fixtures/reschedules refresh
  **daily** (`SCHEDULE_FIXTURE_TTL` = 1 day).
- Source is **ESPN's scoreboard (free)** — parsed to `scheduled/live/final` +
  scores + winner. Live status and week-closing therefore **do not consume the
  Odds API quota** (odds refresh is separately quota-gated).
- leagues grades off the ingestor's **cached** event (`get_event`, no force
  refresh — unlike H2H `settle_due`), so end-to-end "ESPN finals → pick graded"
  latency is ≈ **1–1.5 min** (≤60s score TTL + ≤30s next leagues tick).
- Backstop: `reap_stale_events` sweeps anything still scheduled/live **>12h**
  past start so a missed score never strands an event.

### Hardened in this change
Two liveness edges surfaced during the audit are now fixed in code:

- **Null `ends_at` strand (was: a period with no end never closes).**
  `_prebuild_periods` now **guarantees a non-null `ends_at`** — if a week arrives
  without an end, it derives one a week out from the start; a week with neither
  is skipped. So no weekly period can sit OPEN forever.
- **12h-reap "silent everyone-loses" (was: a missed score fabricated a 0-0
  `final` → every pick graded a loss).** Two coordinated fixes:
  1. The ingestor reaper now marks stale games **`cancelled`**, not `final` — the
     honest "we never observed a result" state. (This also fixes a latent **H2H**
     bug: a fabricated 0-0 `final` could mis-settle a totals/spread wager; a
     `cancelled` event void-refunds both instead.)
  2. Pick'em grading treats a cancelled/void game — or a `final` with no winner
     **and** no scores — as **no-contest**: a new `Pick.voided` flag (migration
     `l3m4n5o6p7q8`) *resolves* the pick (so the period can still finalize and
     announce a winner) but **excludes it from the win/loss tally** — it is never
     counted as a loss. A genuine drawn `final` (scores present, no winner) still
     grades as a loss for everyone who picked a team.

  This closes the scoring half of **G8**. The remaining half — *telling* the
  member "this game voided, no result" — is still a notification gap (see G3/G8).

### Still worth adding (not yet built)
- A **monitor/alert on reap volume**: a spike in cancelled-by-reap events means
  the ingestor's score refresh is failing for a league, and picks are quietly
  voiding instead of grading. Cheap to add, high signal.
- The **G2 lock consolidation** (persisted `CLOSED` state) is unchanged by this —
  closing (finalize) and locking (freeze edits) are still separate mechanisms.

---

## 3. Current-state audit

### Solid / done
- Weekly period prebuild + auto-rollover from the real ingestor schedule.
- Per-game and per-slate pick locking; changed picks reset `correct` for
  re-grading.
- Tiebreaker on the last game with competition-rank tie-breaking.
- Grading decoupled from period status (late finals still grade).
- Winner announcement that **waits for every pick to grade** before naming a
  winner (`_period_final_body` returns `None` until fully graded;
  `_reannounce_winners` backfills).
- Invite paths: friend invite, reusable link, invites inbox.
- Roles: commissioner / moderator / member, transfer, archive, remove, leave.
- Feed + comments + unread watermark.
- Test coverage exists: `test_pickem.py`, `test_pickem_e2e.py`,
  `test_period_boundaries.py`, `test_invite_codes.py`, `test_roles.py`, plus
  `tests/PICKEM_E2E.md`.

### Gaps (what blocks "ship")

| # | Gap | Evidence | Severity |
|---|-----|----------|----------|
| G1 | **No "season complete" terminal state.** `League.COMPLETED` is defined but never assigned; `archive` is the only exit. A finished season just sits ACTIVE forever. | `league.py` status consts; no writer | High |
| G2 | **Pick-lock model is split-brained.** Server locks *per game* at kickoff (`submit_picks`); FE locks the *whole slate* 1h before the first game. `LeaguePeriod.CLOSED` exists to represent "locked, not final" but is never set. Two sources of truth = confusing UX + drift risk. | `period.py` CLOSED unused; FE `picksLocked` | High |
| G3 | **No pick-reminder notifications.** Notifications fire on invites only. Members get no "picks lock in 1h" / "you haven't picked this week" nudge — the single biggest engagement lever for a pick'em app. | `_notify_league` used for invites only | High |
| G4 | **Invite lifecycle half-wired.** `LeagueInvite.DECLINED`/`REVOKED` are defined but no endpoint transitions to them; `my_invites` only lists PENDING. Sender can't revoke, invitee can't decline. | invite model vs routes | Medium |
| G5 | **Single-use invite codes designed, not built.** Consume logic exists (`act_on_code`), but nothing ever creates a `single_use=True` code. | `INVITE_CODES_DESIGN.md`; no writer | Medium |
| G6 | **No end-of-season / champion summary.** No season leaderboard freeze, no "🏆 League champion" moment, no shareable recap. Ties to G1. | — | Medium |
| G7 | **Season-type Pick'em is thin.** A single period spanning the whole season means one giant pick slate and no weekly cadence; unclear this mode is actually desirable vs. weekly-only. | `activate_league` fallback | Low/decision |
| G8 | **Void/tie handling.** ✅ *Scoring fixed* — a cancelled/void game (or a resultless `final`) now voids picks (`Pick.voided`, no-contest, excluded from the tally) instead of marking every pick a loss; see §2. **Remaining:** *telling* the member "this game voided, no result" (a notification, ties to G3). | §2; `Pick.voided` | Low (was Medium) |
| G9 | **No re-pick / lineup-lock audit trail.** Picks are upserted in place (`updated_at` only); no history of what changed when. Fine for launch, matters if disputes arise. | `Pick` model | Low |

---

## 4. Phased build plan

### Phase 0 — Decisions (do first; each unblocks a phase)
- **D1 (→ G1/G6):** Does a season "end"? Proposal: **yes** — add a `COMPLETED`
  transition + champion summary. Confirm.
- **D2 (→ G2):** Adopt **`CLOSED` as the canonical lock state**, set at first
  kickoff, and make both server and FE read period status rather than
  recomputing the 1h window. Confirm the lock trigger (first-game kickoff vs.
  fixed 1h-before).
- **D3 (→ G7):** Keep season-type Pick'em, or **weekly-only** for launch and
  hide the season option? Recommend weekly-only at launch.

### Phase 1 — Lock model + correctness (highest confusion risk)
- **G2:** Persist period lock. Add a rollover/tick step that flips OPEN →
  `CLOSED` when the first game starts (or at the chosen lock time); `submit_picks`
  rejects on `CLOSED`; FE reads `period.status` for the lock banner instead of
  `picksLocked` math. Migration: none (column exists) — this is behavior, not
  schema.
- **G8 (scoring):** ✅ **Done** — void picks (`Pick.voided`) are no-contest and
  excluded from the tally (see §2). Remaining FE/notify work moves to Phase 2
  under G3 ("this game voided, no result").
- Tests: extend `test_period_boundaries.py` for the CLOSED transition.
  (Void grading is now covered in `test_pickem.py`:
  `test_grading_voids_cancelled_game`, `test_grading_voids_final_without_a_result`.)

### Phase 2 — Engagement (the retention loop)
- **G3:** Pick-reminder notifications via the notifications service:
  - "Week N picks are open" on rollover (`period_opened`).
  - "Picks lock in 1h — you're missing N games" to members with incomplete
    picks (new tick step comparing member picks vs. slate).
  - "Results are in — you went X/Y, finished #Z" on `period_final`.
  - All must honor the notifications opt-out prefs (see
    [`legal-and-signup-consent`] wiring) and be **best-effort** like existing
    `_notify_league`.
- **G4:** Wire invite decline/revoke: `POST /<league>/invites/<id>/decline`
  (invitee), `DELETE /<league>/invites/<id>` (sender/commish), and include
  DECLINED/REVOKED in `my_invites` filtering. FE: decline button in the Invites
  inbox.

### Phase 3 — Season completion (the finish line)
- **G1 + G6:** Add the completion transition:
  - Commissioner action `POST /<league>/complete` (and/or auto-complete when the
    last prebuilt period goes FINAL) → `League.COMPLETED`.
  - Freeze final standings; write a `league_completed` feed row with the
    champion.
  - Champion summary view (season leaderboard, per-week winners, your record) —
    reuse `standings` + `_period_leaderboard`.
  - Notification: "🏆 <name> won <league>."
  - COMPLETED leagues are read-only (no new picks/periods) but still viewable;
    `archive` remains available afterward.

### Phase 4 — Polish + hardening
- **G5:** Single-use / targeted invite codes if product wants them (model is
  ready; add a `single_use=True` creation path + one-tap "invite this friend"
  that mints a personal code). Otherwise mark as deferred in
  `INVITE_CODES_DESIGN.md`.
- **G9:** Optional pick-change audit (append-only `pick_events`) if disputes
  become a support burden.
- Empty/degenerate states: 0-game weeks, all-void weeks, single-member leagues,
  a week where nobody picks.

---

## 5. Mobile (Flutter iOS + Android)

The native app consumes the **same `/v1/gameplay/leagues` API** — no Pick'em
logic should live only in the webui. Specific implications for the plan:

- **G2 lock model:** moving the lock decision server-side (period `status`)
  means mobile doesn't have to reimplement the 1h-before-first-game math — it
  just reads `period.status`. **This is a mobile-driving reason to do G2.**
- **G3 notifications:** pick reminders should route to **push (APNs/FCM)** for
  native clients, not just in-app — this is where the notifications service's
  device-token/channel work needs to be ready. Track as a dependency.
- **Deep links:** `/c/<code>` invite links must resolve as **universal links /
  app links** into the native league preview, matching the web `(public)/c/[code]`
  page.
- Keep every new endpoint JSON-first and cookie-optional (native sends
  `Authorization: Bearer` via `X-Client-Type: mobile`).

_No mobile build work is scheduled here_ — these are constraints so the backend
doesn't have to be reworked when the Flutter app is built.

---

## 6. Launch checklist (Pick'em slice)
- [ ] D1–D3 decided.
- [ ] Period lock persisted as `CLOSED`; single source of truth for locking (G2).
- [ ] Void/tie results shown, not silently lost (G8).
- [ ] Pick-open / pick-reminder / results notifications live and opt-out-aware (G3).
- [ ] Invite decline + revoke wired (G4).
- [ ] Season completion + champion summary (G1/G6).
- [ ] Degenerate weeks handled (0-game, all-void, no-pick).
- [ ] Mobile: lock + reminders readable from API; `/c/` deep links planned.
- [ ] Regression: `test_pickem_e2e.py` covers create → activate → pick → lock →
      grade → roll → complete.
