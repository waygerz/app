# Feature plan: System-managed global leagues

Net-new feature, planned against the current code (Aug 2026). Mobile-first. No
code written yet — this is the design to react to before build.

**Decisions locked:** free **weekly pick'em only**, **auto-join at signup**,
**season ranking by correct count with an MNF-accuracy tiebreak, no `losses`
key** (ungameable and needs no slate data; see Leaderboard).

Companion plan: `FEATURE_PLAN_favorite_teams.md`.

---

## What the code gives us (and the gaps)
- **Pick'em weekly leagues already self-run *during the season***: on `activate`
  they prebuild one period per ingestor week; the scheduler `/internal/tick`
  (every 30s) auto-grades picks, reconciles finals, and rolls periods
  `OPEN→FINAL→next`. So the net-new work is a way to *exist*, be *discovered*, and
  be *joined* — **plus** three things the code does NOT do today (see Leaderboard):
  **season completion** (weekly leagues never end — `rollover_periods` synthesizes
  a generic `Week N+1` forever, `:594-601`), **standings materialization**, and the
  **winner freeze**.
- **Gaps** (all net-new): no system/public/visibility concept; `commissioner_id`
  is required and drives every ownership guard; "My Leagues" (`GET /`) is
  strictly membership-scoped; there is **no code-less open-join** and **no
  browse/discover** surface; no seed/CLI creates leagues.

## Model changes — `api/leagues/app/models/league.py`
Add two columns (new migration):
- `is_system` Boolean, default `false`, indexed — marks a global, app-owned
  league. Serves as the "public/discoverable" flag too (no separate visibility
  enum in v1).
- `auto_enroll` Boolean, default `false` — meaningful only for system leagues;
  new signups are auto-joined to every `is_system && auto_enroll && active`
  league.

Also add to `api/leagues/app/models/member.py` (**same migration**):
- `group_id` UUID nullable, indexed — a **deferred hook** for display pods (see
  "Leaderboard → Deferred: display pods"). **Not used in v1** — the leaderboard
  is a paginated global board + Friends, so this stays `null`; picks, scoring, and
  the global rank ignore it entirely. It ships in the launch migration purely so
  pods can be switched on later with zero pick-data migration.

**System actor:** reserve a constant `SYSTEM_USER_ID` (fixed UUID) used as
`commissioner_id` for system leagues. This keeps `commissioner_id` non-null and
means **every existing ownership guard denies all normal users automatically**
(no real user's id equals the system id) — no guard rewrite, no nullability
change. Members can still `leave` (opt out); no real user is commissioner, so the
"commissioner can't leave" rule never traps anyone.

**⚠️ Two traps the audit surfaced with this approach:**
1. **Phantom member.** `create_league` auto-inserts the creator as a
   `LeagueMember(role=commissioner, active)` (`service_leagues.py:812`). If the
   CLI reuses `create_league` as-is, `SYSTEM_USER_ID` becomes a fake member —
   it inflates the member count and renders as a `User xxxxxxxx` fallback (auth's
   `/internal/users` returns nothing for it; degrades gracefully, no crash, but
   ugly). **Fix:** the system-league creation path must **not** insert the
   `SYSTEM_USER_ID` member row.
2. **Activation vs membership.** But `activate_league` requires **both**
   `commissioner_id == me` **and** `_membership(league_id, me)`
   (`service_leagues.py:1029`; membership guard `:1032`, commissioner `:1034`).
   Skip the member row and the guarded
   `activate_league(SYSTEM_USER_ID)` now 404s on the membership check. **Fix:**
   don't drive system-league activation through the guarded HTTP-facing function
   at all — extract the activation core (status→active + `_prebuild_periods`) into
   a helper the CLI calls directly, bypassing both the commissioner and
   membership guards. (Normal user activation still goes through the guarded
   wrapper.)

For system leagues, **hide the invite code** and edit/transfer/role UI (they're
app-managed). Nothing enforces this server-side beyond the guards already
denying non-system callers.

## Creation & lifecycle — CLI, not UI
- **`flask create-system-league`** in `api/leagues` (new CLI cmd):
  `--sport football --league nfl --name "NFL Pick'em (Global)" --season 2026
  [--auto-enroll]`. Creates the league (`commissioner_id=SYSTEM_USER_ID`,
  `league_type=pickem`, `period_type=weekly`, `is_system=true`), adds the
  `LeagueSport`, **skips the phantom member row**, and **activates via the
  extracted core helper** (see the activation trap above). No seed migration
  inserts data (keeps migrations DDL-only, per repo convention).
- **⚠️ Idempotency — must add.** There is **no** unique constraint on
  `(sport, season)` (or anything) for leagues, and `create_league` does no
  existence check — so running the CLI twice creates **duplicate** global
  leagues. The CLI must first look for an existing `is_system` league matching
  the sport/league/season and no-op (or `--force`) instead of blindly inserting.
- **⚠️ Schedule-timing gotcha.** `_prebuild_periods` pulls weeks from the
  ingestor (`.../schedule/by-catalog/<id>/weeks`). If the season isn't ingested
  yet, activation **degrades to a single synthetic "Week 1"** period (no error) —
  and the tick does **not** re-pull: `rollover_periods` just synthesizes generic
  `Week N+1` labels forever (`:596-600`); only the manual `regenerate_periods`
  path re-reads the ingestor (`:647`). **So create/activate the global league
  only AFTER the season's schedule is ingested, or run `regenerate_periods` once
  it lands.** As of 2026-09-08 the 2026 NFL regular season is already underway, so
  the schedule should be ingestable now — **verify the weeks are present (via
  `ingestor_weeks`) before seeding; if the league was seeded earlier and only has
  the synthetic Week 1, run `regenerate_periods` once.**
- **Season rollover** (NFL season ends → need next year's): a manual re-run of
  the CLI per season for v1. Noted as a known follow-up, not automated.
- **Timing note:** the natural v1 default auto-enroll league is **NFL Pick'em
  (Global), season 2026**.

## Auto-join at signup
- **`POST /internal/enroll-defaults`** in `api/leagues` (`@internal_only`): body
  `{ user_id }`; joins that user (reusing the existing role-agnostic `_join()`)
  into every `is_system && auto_enroll && active` league. Idempotent via `_join`'s
  **pre-SELECT** on `(league_id, user_id)` (`:739`) — it reactivates or no-ops an
  existing member (there is **no** upsert / `IntegrityError` handling). ⚠️ That's
  check-then-insert, so two truly-concurrent first joins could both miss the SELECT
  and the loser hits the `uq_league_member` unique constraint with an **uncaught**
  `IntegrityError` — very low risk for a once-per-signup call, but wrap the insert
  in a try/except (catch IntegrityError → treat as already-joined) to be safe.
- **`auth` calls it** from **`otp_complete()` in `service_auth.py` (`:227`),
  right after the `User` is created + the best-effort notifications opt-in block
  (User construction is `:252-258`)** — this is the *only* place the real signup
  flow creates a `User` (OTP *verify* does not create; the returning-user login
  path lives in `otp_verify` ~`:220`, and the `:249` guard here rejects a
  duplicate phone), so the hook fires exactly once per new account.
  Copy the existing internal-call convention (`service_notifications._sync_prefs`,
  `service_notifications.py:17-27`):
  `requests.post(f"{INTERNAL_LEAGUES_URL}/internal/enroll-defaults", json={...},
  headers={"X-Internal-Token": Config.INTERNAL_TOKEN}, timeout=10)` in try/except.
  **`INTERNAL_LEAGUES_URL` already exists** in auth's `config.py:86` (compose
  default) — the only real task is ensuring the **prod taskdef sets the
  `https://waygerz.com` ALB form**, not the compose default, or the call silently
  no-ops.
- **⚠️ `flask create-user` bypasses `otp_complete`** — it constructs the `User`
  directly (`auth/app/__init__.py:35-39`, `User(...)` at `:54`) and shares no
  creation helper, so CLI-made accounts won't auto-enroll. **RECOMMENDATION:
  skip** — CLI is a dev/admin path; not worth a second call site (overridable).
- **Existing users backfill:** one-off **`flask backfill-enrollments`** in
  leagues that enrolls a set of user ids into auto-enroll leagues. (Leagues can't
  list all users — not its schema.) **RECOMMENDATION:** add a throwaway auth
  `/internal/all-user-ids` (reusable, trivial) rather than hand-listing ids. Run
  once via the pinned-`:sha` one-off `run-task`.
- **Robustness gap (acknowledged):** if leagues is down during a signup, that
  user misses auto-join until a re-run of the backfill. Acceptable at current
  scale; a tick-time reconcile is the future fix.

## Discovery & join (browse still useful)
Even with auto-join, users need to find/join the *non-default* global leagues and
**re-join** after leaving:
- **`GET /discover`** (or `/system`) in leagues, JWT required: returns active
  `is_system` leagues with a `joined` flag for the caller (member counts, current
  period). Not membership-scoped. Reuse the **`my_leagues` card-builder shape**
  (`:872-895` — already yields `member_count`/`top_members`/`current_period`/
  logo/type/status); it's membership-joined today, so `/discover` is a net-new
  non-scoped query `League.query.filter_by(is_system=True, status=ACTIVE)` feeding
  that builder + a per-league membership lookup for the `joined` flag.
- **`POST /<id>/join-open`** code-less join path, allowed **only when
  `is_system && active`** (reuse `_join()`, safe + idempotent for free pickem).
  ⚠️ `_join` itself does **no status gate** (`:738-758` — it happily adds an active
  member to a `draft` league), so the `is_system && active` guard **must live in
  this new route/controller**, not in `_join`. **NB: `POST /<id>/join` already
  exists** and maps to `accept_invite` (invite acceptance), so open-join must use a
  distinct path (`/join-open`), not `/join`.
- **Web surface:** a **"Global leagues"** section on the home page
  (`web/app/(app)/page.tsx`) under "My Leagues", listing discoverable system
  leagues with Join / "Joined ✓". A dedicated `/leagues/browse` page is overkill
  for v1's handful of globals.

## Leaderboard & the overall winner

The system league is **one contest**: every user is auto-joined, picks the same
weekly slate, and holds **one global rank** in a single season standing. The
surfaces and winner rules below are all *views and settlement over that one flat
record* — nothing here forks the pick or membership data (picks stay one row per
`(user, period, event)`, `uq_pick`).

### The scale gap (must fix — the one real hole in this plan)
`standings()` (`service_leagues.py:1188`) loads **every** Pick row for the league
into memory (`:1220`) and tallies per member in Python — no aggregation, no
pagination. Fine for a 20-person league; a bomb for an everyone-league
(all users × ~16 picks/week × 18 weeks). Before this becomes auto-enroll:
- Rewrite the tally as a **SQL aggregate** — `GROUP BY user_id`,
  `count(*) FILTER (WHERE correct)` over `league_picks`. Because ranking is by
  correct count (not unpicked-as-loss), this aggregate over existing picks **is**
  the standing — no `members × slate` cross-product needed.
- **Materialize a per-member standing** (correct count, cumulative MNF-accuracy
  for the tiebreak, and global rank) updated at grade time in the tick, so reads
  are cheap and the global rank is precomputed.
- Never render the whole list — every surface is a **scoped slice** (below).

### Leaderboard surfaces — a paginated global board + Friends
The leaderboard is **one global standing, windowed** — you never render all 100k
rows, you slice into them. All four surfaces come straight off the materialized
per-member standing (so each is a cheap `LIMIT`/window query), in both a **weekly**
and a **season-cumulative** cadence:
1. **Global Top 100** — the site-wide leaders; a `LIMIT 100` slice everyone shares.
2. **Your rank + neighborhood** — your global rank with the handful of players
   above/below you (a window centered on you), plus a **jump-to-me** control. Keeps
   "#12,403 site-wide" meaningful without a giant list.
3. **Browse** — ordinary paging (cursor/offset) down the full standing for anyone
   who wants to scroll past the top.
4. **Friends** — your friends ranked against each other (a filter over the same
   standing). This is the real **small-pond** competition — a meaningful weekly race
   against people you know, which matters far more for engagement than placement in
   a list of 100k strangers.

Pagination + Friends covers both problems a giant board has: **rendering** (windowed
slices, never the whole list) and **motivation** (Friends gives everyone a race they
can actually win). No cohort/grouping machinery is needed for v1.

### Deferred: display pods (only if a flat board proves demotivating)
A *pod* would be a ~100-user display cohort (the nullable `group_id` on
`league_members`, already in the launch migration) giving each user a "1st of 100"
race among strangers. **We are not building pods in v1:** pagination handles
rendering, and Friends already provides the motivating small-group competition, so a
random stranger-cohort adds real complexity (assignment, concurrency, naming, and
pod-shopping rules) for a weaker version of what Friends does.

`group_id` stays in the schema as the **cheap escape hatch**. If engagement data
later shows the flat board is demotivating *and* Friends isn't enough, turning pods
on is **zero pick-data migration**: populate `group_id` (fill the open pod to ~100
then open the next; **sticky per season**), and add a per-pod leaderboard scope.
Rules if it ever ships: **no user-facing pod switching** (pod-shopping), leave→rejoin
keeps the same pod, new season = fresh pods; the overall winner stays the global #1
regardless (a pod would only ever show a cosmetic "pod champ").

### Determining the overall winner
The champion is **#1 in the global season-cumulative standing** — a single,
site-wide title. Crown **two** things to keep 100k people engaged:
- **Weekly winner** each week — already computed by `_period_leaderboard`
  (`:1263`), tie-broken by the MNF-total prediction (`tiebreaker_total`).
- **Season champion** — top of the cumulative standing at season end.

**Metric:** total correct picks across all 18 weeks (existing `standings()` sum of
`correct`, voided excluded). **Tiebreaker cascade** (needed — 100k players pile up
on identical correct counts):
1. Most season correct picks.
2. **Season tiebreaker accuracy** — cumulative `|predicted MNF total − actual|`
   across weeks, lowest total error (accumulate the per-week `tiebreaker_total`).
3. Best single week (highest weekly correct count).
4. Still tied → **co-champions** (play-money bragging rights; don't invent a coin
   flip).

**⚠️ Tiebreaker data reality (audit 2026-09-10) — DECISION NEEDED.**
`tiebreaker_total` is an **optional** per-week per-pick field (`pick.py:37`, set in
`submit_picks` `:1101/:1140/:1144`), honored only on the week's last game
(`_period_leaderboard:1310`), computed on the fly and **never persisted**. Two
consequences the cascade above has to reckon with:
- **It degenerates at scale.** Most of 100k casual users never enter an MNF total,
  so step 2's cumulative accuracy is null/undefined for them (`_period_leaderboard`
  already sorts a null tb as `+inf`, `:1319/:1332`). The cascade then collapses to
  large co-champion ties right after step 1 — far less discriminating than it reads.
- **A "final-game / championship" tiebreaker has NO data source.** There is no
  season-level single-prediction capture anywhere (grep: `tiebreaker_total` is only
  the per-week column) — so that step was **net-new capture**. It's been dropped
  from the cascade above; re-adding it means a new season-tiebreaker field + UI.

**Recommendation:** make the **weekly MNF total required** on submit (small change
to `submit_picks`) so step 2's cumulative accuracy is well-defined for everyone who
played that week; then the cascade is real without any season-level capture. If we
don't require it, accept that co-champions will be common and keep the cascade
best-effort. *(Confirm which.)*

**Fairness — rank by correct count, drop the `losses` key.** Ranking by raw
correct count is already ungameable: every game you pick has non-negative
expected value, so the optimal play is to pick them all — sitting games out only
costs you wins, it never helps. The one exploitable spot was the *secondary* sort
in `standings()` (`(-wins, losses, name)`, `:1247`): a cherry-picker with the
same correct count but fewer picks has fewer losses and won the tiebreak over
someone who played the full slate. **DECIDED 2026-09-08: drop `losses` as a
tiebreaker; rank by correct count and break ties with the MNF-accuracy cascade
below.**

Crucially this needs **no slate data** — leagues does not store the per-period
game list (audit 2026-09-08: no event table; `standings()`/`_period_leaderboard`
derive their game set from the picks that exist), so "unpicked = a loss" would
have required pulling+persisting the full slate from the ingestor and scoring
`members × slate` on both boards. The correct-count rule avoids all of that, and
`_period_leaderboard` **already** ranks `(-correct, tiebreaker_diff, name)` with
no `losses` key (`:1330-1334`) — so the **weekly board needs no change**; only
season `standings()`'s sort changes.

**⚠️ Settlement / determinism — all net-new (audit 2026-09-10).** Don't crown at
the final whistle — the tick's `reconcile_recent_finals` self-heals late score
corrections for **3 days** (`service_leagues.py:495`). After the last period flips
`final`, **wait out the reconcile window, then compute final standings once and
freeze/materialize them** (a late stat correction must not silently dethrone a
crowned champion) and flip the league to `status=completed`. Three things this
needs that **do not exist today**:
- **Season-end is net-new — weekly leagues never end.** `rollover_periods`
  synthesizes a generic `Week N+1` OPEN period forever (`:594-601`); there is no
  "last week → done" path. The system league needs an explicit season-end: stop
  rollover when the ingestor reports no further week (or a configured final week)
  and set completion. **Without this the global league sprouts phantom Week 19,
  20, … indefinitely.**
- **`status=completed` is net-new.** The `COMPLETED = "completed"` enum exists
  (`league.py:16`) but **no code path ever sets it** — the flip is new write logic.
- **Materialized/frozen standings are net-new.** There is no cached-standings
  table today (both the live materialized standing and the frozen final one are
  new models/rows).

## Mobile notes
- Global-league cards match the existing My-Leagues card; one-tap Join, ≥44px.
- The global board is the home surface; Global Top 100 / Your rank / Friends are
  tabs or a segmented control, with jump-to-me + paged scroll for browsing — all
  ≥44px, no horizontal scroll.
- Auto-joined default league simply appears in My Leagues on first load — no
  empty-state dead end for brand-new users (nice onboarding win).

## Cross-cutting
- Discover/join routes live under the existing `leagues` prefix
  (`/v1/gameplay/leagues`); the internal enroll route stays off the gateway
  (compose / ALB internal only, `X-Internal-Token`). **No gateway `default.conf`
  change**, `web/lib/api-paths.ts` untouched.
- One migration: `leagues` adds `is_system`, `auto_enroll` (on `leagues`) and
  `group_id` (on `league_members`, nullable). Applied in prod via the
  pinned-`:sha` one-off `run-task` procedure.
- No Next.js build on the 2 GB host; use lint + memory-bounded `tsc`.
- Commit each edit; **deploy only when told**. Migrations + CLI seeds are
  explicit, gated actions.

## Build sequence
1. **Backend** (leagues: 3 columns + migration [`is_system`, `auto_enroll`,
   `group_id`], `SYSTEM_USER_ID`, `create-system-league` CLI, `GET /discover`,
   open-join, `enroll-defaults` internal + auth signup call + taskdef URL).
2. **Standings scale + winner + season-end** (leagues, all net-new per the
   2026-09-10 audit): SQL-aggregate/materialized standings; paginated leaderboard
   endpoints [global Top N / your-rank neighborhood + jump-to-me / paged browse /
   friends]; correct-count ranking (drop the `losses` sort key in `standings()`;
   add cumulative MNF-accuracy tiebreak — and decide whether to require the weekly
   MNF total); **season-end** (stop `rollover_periods` when the ingestor has no
   further week, instead of synthesizing `Week N+1` forever); freeze + set
   `status=completed` after the reconcile window. `group_id` ships in the migration
   but is unused (deferred pods).
3. **Web** (home "Global leagues" section + Join; global board as the home surface
   with Top 100 / Your rank / Friends slices + paged browse).
4. **Seed + backfill** (run CLI to create NFL Pick'em Global 2026 auto-enroll;
   backfill existing users) — a deploy-time action, on your word.

## Audit (re-verified against code, 2026-09-08)
All claims re-checked against the current `leagues` + `auth` services (line
numbers had drifted since the 2026-08-14 pass). Verdicts + current locations:
- **Route collision** — VERIFIED. `POST /<uuid:league_id>/join` = `accept_invite`
  (`route_leagues.py:93-95`). → open-join uses `/join-open`.
- **Phantom member** — VERIFIED. `create_league` inserts the creator as a
  commissioner member (`service_leagues.py:812`; renders as `User xxxxxxxx` via
  `/internal/users`). → system path skips the member row.
- **Activate guard** — VERIFIED. `activate_league` (`:1029`) needs
  `commissioner_id == me` (`:1034`) **and** membership (`:1032`). → extract an
  unguarded activation core for the CLI.
- **`_join` for pickem** — VERIFIED safe + idempotent. `_join` `:738` reactivates
  a left/removed row; `grant_starting_balance` no-op guard `:388` (gated on
  `is_money`; pickem isn't in `MONEY_TYPES`); unique `(league_id, user_id)`
  (`member.py:20-22`) makes re-join idempotent.
- **Period build** — VERIFIED. `_prebuild_periods` `:298` (ingestor fetch `:311`);
  synthetic Week-1 fallback in `activate_league` `:1046-1068`; `rollover_periods`
  `:567` never re-pulls (`:596-600`); only `regenerate_periods` `:636` does
  (`:647`). → seed after ingest, or regenerate.
- **Idempotency** — VERIFIED there is none (no unique constraint on `League`;
  `create_league` `:761` inserts unconditionally). → CLI must do its own check.
- **Signup hook** — VERIFIED. Sole real-signup `User` creation is `otp_complete()`
  `:227` (User at `:252-258`; returning-user branch `:249`). `flask create-user`
  (`auth/app/__init__.py:35`, User at `:54`) bypasses it. `INTERNAL_LEAGUES_URL`
  already in `config.py:86`; convention `service_notifications._sync_prefs:17-27`.
- **Standings scale** — VERIFIED. `standings()` `:1188` full-scans every Pick
  (`:1220`), tallies in Python, sorts `(-wins, losses, name)` (`:1247`). → SQL
  aggregate + materialized per-member standing.
- **Weekly board already correct-count-ranked** — VERIFIED. `_period_leaderboard`
  `:1263` sorts `(-correct, tiebreaker_diff, name)` (`:1330-1334`), no `losses`
  key. → season `standings()` should match it (drop `losses`).
- **No slate in leagues (kills "unpicked = a loss")** — VERIFIED. No event/game
  table; `_prebuild_periods` stores only week label/start/end; grading
  (`grade_period` `:427`) and both boards derive games from existing picks only.
  → rank by correct count instead (needs no slate); see Leaderboard fairness note.
- **`reconcile_recent_finals`** — VERIFIED `:495`, `window_days=3` (`:508`),
  called from `tick()` (`service_internal.py:118`). → freeze standings after the
  3-day window.

### Second pass (2026-09-10) — line numbers all re-confirmed; new holes found
- **Weekly leagues never end.** `rollover_periods` synthesizes `Week N+1` forever
  (`:594-601`); season-end/completion is entirely net-new (see Settlement).
- **`status=completed` enum exists, nothing sets it** (`league.py:16`); the flip
  is new write logic. No materialized/cached standings table exists — net-new.
- **Tiebreaker cascade degenerates:** `tiebreaker_total` is optional & mostly null
  at scale, so the cumulative-accuracy tiebreak is undefined for most users; and a
  season-level "final-game" tiebreaker had no capture (dropped). See the ⚠️ under
  the winner cascade — decide whether to require the weekly MNF total.
- **`enroll-defaults` idempotency is check-then-insert, not upsert** — `_join`'s
  pre-SELECT (`:739`), no `IntegrityError` guard; wrap the insert to swallow the
  rare concurrent-first-join `uq_league_member` race.
- **`_join` has no status gate** (`:738-758`) — the `is_system && active`
  restriction must live in the `/join-open` route, not `_join`.
- **`/discover`** should reuse the `my_leagues` card-builder (`:872-895`), which
  already yields `member_count`/`current_period`; it's membership-joined today, so
  the non-scoped query + `joined` flag are net-new.
- Minor: `otp_complete`'s `:249` is the duplicate-phone guard (returning-user login
  is in `otp_verify` ~`:220`) — conclusion unchanged.

## Open follow-ups (noted, not v1)
- Season-rollover automation for global leagues.
- Tick-time enrollment reconcile (robustness for missed signups).
