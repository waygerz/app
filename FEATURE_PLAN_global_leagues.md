# Feature plan: System-managed global leagues

Net-new feature, planned against the current code (Aug 2026). Mobile-first. No
code written yet — this is the design to react to before build.

**Decisions locked:** free **weekly pick'em only**, **auto-join at signup**.

Companion plan: `FEATURE_PLAN_favorite_teams.md`.

---

## What the code gives us (and the gaps)
- **Pick'em weekly leagues already self-run**: on `activate` they prebuild one
  period per ingestor week; the scheduler `/internal/tick` (every 30s)
  auto-grades picks, reconciles finals, and rolls periods `OPEN→FINAL→next`. **A
  system pick'em needs no new manager** — only a way to *exist*, be *discovered*,
  and be *joined*.
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

**System actor:** reserve a constant `SYSTEM_USER_ID` (fixed UUID) used as
`commissioner_id` for system leagues. This keeps `commissioner_id` non-null and
means **every existing ownership guard denies all normal users automatically**
(no real user's id equals the system id) — no guard rewrite, no nullability
change. Members can still `leave` (opt out); no real user is commissioner, so the
"commissioner can't leave" rule never traps anyone.

**⚠️ Two traps the audit surfaced with this approach:**
1. **Phantom member.** `create_league` auto-inserts the creator as a
   `LeagueMember(role=commissioner, active)` (`service_leagues.py:800`). If the
   CLI reuses `create_league` as-is, `SYSTEM_USER_ID` becomes a fake member —
   it inflates the member count and renders as a `User xxxxxxxx` fallback (auth's
   `/internal/users` returns nothing for it; degrades gracefully, no crash, but
   ugly). **Fix:** the system-league creation path must **not** insert the
   `SYSTEM_USER_ID` member row.
2. **Activation vs membership.** But `activate_league` requires **both**
   `commissioner_id == me` **and** `_membership(league_id, me)`
   (`service_leagues.py:1017-1023`). Skip the member row and the guarded
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
  `Week N+1` labels forever; only the manual `regenerate_periods` path re-reads
  the ingestor. **So create/activate the global league only AFTER the season's
  schedule is ingested, or run `regenerate_periods` once it lands.** Given
  2026-08-14 is NFL preseason, verify the 2026 NFL schedule is ingested before
  seeding, or plan the regenerate.
- **Season rollover** (NFL season ends → need next year's): a manual re-run of
  the CLI per season for v1. Noted as a known follow-up, not automated.
- **Timing note:** the natural v1 default auto-enroll league is **NFL Pick'em
  (Global), season 2026**.

## Auto-join at signup
- **`POST /internal/enroll-defaults`** in `api/leagues` (`@internal_only`): body
  `{ user_id }`; joins that user (reusing the existing role-agnostic `_join()`)
  into every `is_system && auto_enroll && active` league. Idempotent (the
  `(league_id, user_id)` unique constraint + upsert).
- **`auth` calls it** from **`otp_complete()` in `service_auth.py`, right after
  the existing best-effort notifications opt-in block (after line ~253)** — this
  is the *only* place the real signup flow creates a `User` (OTP *verify* does
  not create; returning-user login never reaches here), so the hook fires exactly
  once per new account. Copy the existing internal-call convention:
  `requests.post(f"{INTERNAL_LEAGUES_URL}/internal/enroll-defaults", json={...},
  headers={"X-Internal-Token": Config.INTERNAL_TOKEN}, timeout=10)` in try/except
  (same shape as `service_notifications._sync_prefs`). Add `INTERNAL_LEAGUES_URL`
  to `config.py` alongside `INTERNAL_NOTIFICATIONS_URL` — **must be the
  `https://waygerz.com` ALB form in prod**, not the compose default, or the call
  silently no-ops.
- **⚠️ `flask create-user` bypasses `otp_complete`** — it constructs the `User`
  directly and shares no creation helper. CLI-made accounts won't auto-enroll
  unless we add a second call site there. **OPEN QUESTION:** cover CLI accounts
  (second call site) or accept that only OTP signups auto-enroll? (CLI is a dev/
  admin path, so probably fine to skip — decide.)
- **Existing users backfill:** one-off **`flask backfill-enrollments`** in
  leagues that enrolls a set of user ids into auto-enroll leagues. (Leagues can't
  list all users — not its schema — so pass ids in, or add a throwaway auth
  `/internal/all-user-ids` for the backfill. Small userbase → trivial.) Run once
  via the pinned-`:sha` one-off `run-task`. **OPEN QUESTION:** throwaway
  `/internal/all-user-ids` vs hand-listed ids.
- **Robustness gap (acknowledged):** if leagues is down during a signup, that
  user misses auto-join until a re-run of the backfill. Acceptable at current
  scale; a tick-time reconcile is the future fix.

## Discovery & join (browse still useful)
Even with auto-join, users need to find/join the *non-default* global leagues and
**re-join** after leaving:
- **`GET /discover`** (or `/system`) in leagues, JWT required: returns active
  `is_system` leagues with a `joined` flag for the caller (member counts, current
  period). Not membership-scoped.
- **`POST /<id>/join-open`** code-less join path, allowed **only when
  `is_system && active`** (reuse `_join()`, which is safe + idempotent for free
  pickem — verified). **NB: `POST /<id>/join` already exists** and maps to
  `accept_invite` (invite acceptance), so the new open-join route must use a
  distinct path (`/join-open`), not `/join`.
- **Web surface:** a **"Global leagues"** section on the home page
  (`web/app/(app)/page.tsx`) under "My Leagues", listing discoverable system
  leagues with Join / "Joined ✓". A dedicated `/leagues/browse` page is overkill
  for v1's handful of globals.

## Mobile notes
- Global-league cards match the existing My-Leagues card; one-tap Join, ≥44px.
- Auto-joined default league simply appears in My Leagues on first load — no
  empty-state dead end for brand-new users (nice onboarding win).

## Cross-cutting
- Discover/join routes live under the existing `leagues` prefix
  (`/v1/gameplay/leagues`); the internal enroll route stays off the gateway
  (compose / ALB internal only, `X-Internal-Token`). **No gateway `default.conf`
  change**, `web/lib/api-paths.ts` untouched.
- One migration: `leagues` adds `is_system`, `auto_enroll`. Applied in prod via
  the pinned-`:sha` one-off `run-task` procedure.
- No Next.js build on the 2 GB host; use lint + memory-bounded `tsc`.
- Commit each edit; **deploy only when told**. Migrations + CLI seeds are
  explicit, gated actions.

## Build sequence
1. **Backend** (leagues: 2 columns + migration, `SYSTEM_USER_ID`,
   `create-system-league` CLI, `GET /discover`, open-join, `enroll-defaults`
   internal + auth signup call + taskdef URL).
2. **Web** (home "Global leagues" section + Join).
3. **Seed + backfill** (run CLI to create NFL Pick'em Global 2026 auto-enroll;
   backfill existing users) — a deploy-time action, on your word.

## Audit (verified against code, 2026-08-14)
All claims checked against the real `leagues` + `auth` services. Verdicts:
- **Route collision** — VERIFIED. `POST /<uuid:league_id>/join` already =
  `accept_invite` (`route_leagues.py:93`). → open-join renamed to `/join-open`.
- **Phantom member** — VERIFIED. `create_league` inserts the creator as a
  commissioner member (`service_leagues.py:800`); a synthetic id renders as a
  `User xxxxxxxx` fallback via `/internal/users`. → system path skips the member
  row.
- **Activate guard** — VERIFIED. `activate_league` needs `commissioner_id == me`
  **and** membership (`:1017-1023`). → extract an unguarded activation core for
  the CLI (resolves the conflict with skipping the member row).
- **`_join` for pickem** — VERIFIED safe + idempotent. `grant_starting_balance`
  is a no-op for non-money leagues (`:375`); unique `(league_id, user_id)` makes
  re-join idempotent.
- **Period build** — VERIFIED depends on ingestor; degrades to one synthetic
  period, and the tick never re-pulls the schedule (only `regenerate_periods`
  does). → seed after the schedule is ingested, or regenerate.
- **Idempotency** — VERIFIED there is none; duplicate leagues are possible. → CLI
  must do its own existence check.
- **Signup hook** — VERIFIED the sole creation point is `otp_complete()`
  (`service_auth.py:234-243`); `flask create-user` bypasses it. Internal-call
  convention (`requests` + `X-Internal-Token` + `INTERNAL_*_URL`) confirmed.

## Open follow-ups (noted, not v1)
- Season-rollover automation for global leagues.
- Tick-time enrollment reconcile (robustness for missed signups).
