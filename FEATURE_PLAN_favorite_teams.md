# Feature plan: Favorite teams on the profile card

Net-new feature, planned against the current code (Aug 2026). Mobile-first. No
code written yet — this is the design to react to before build.

**Decision locked:** up to **6 favorite teams, ordered**, first = primary.

> **⚠️ Superseded on storage/endpoints by `FEATURE_PLAN_users_service_split.md`.**
> The table is **`users.favorite_teams`** (new `users` service), not
> `auth.user_favorite_teams`, and the endpoints live under `/v1/platform/users`.
> Everything below about the *snapshot approach, ingestor `teams` source,
> `team-picker`, account card, profile-dialog row, and mobile UX* is unchanged —
> only the owning service/schema/prefix moved. Read the split plan first.

Companion plans: `FEATURE_PLAN_global_leagues.md`, `FEATURE_PLAN_users_service_split.md`.

---

## What the code gives us
- The **ingestor** already owns a real `teams` table
  (`api/ingestor/app/models/team.py`): `id`, natural key `(sport, league,
  external_id)` (ESPN team id), plus `name`, `abbreviation`, `slug`, `location`,
  `color`, `alternate_color`, `logo` (S3-mirrored URL).
- Team **list endpoint exists**: `GET /v1/platform/ingestor/sports/<sport>/leagues/<league>/teams`,
  already wrapped web-side by `fetchTeams(sport, league)` in `web/lib/ingestor.ts`.
- There is **no single-team fetch** and **no per-user store** anywhere. `auth`'s
  `User` is "identity only". Other users' public fields (`display_name`,
  `avatar_key`) flow service→service via `auth`'s `POST /internal/users`.
- Precedent: everything denormalizes snapshots (wagers/picks store team *name
  strings* against an event, not team ids). Favorite teams should follow suit —
  **snapshot the team** at pick time so profile cards never depend on a live
  ingestor round-trip.

## Data model — new, in the `auth` service
`api/auth/app/models/favorite_team.py` → table `user_favorite_teams`
(schema `auth`):

| col | type | notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `user_id` | UUID, indexed | owner |
| `sport` | String(32) | ingestor slug, e.g. `football` |
| `league` | String(32) | ingestor slug, e.g. `nfl` |
| `external_id` | String(64) | ESPN team id — the stable reference |
| `name` | String(120) | snapshot ("Arizona Cardinals") |
| `abbreviation` | String(12) | snapshot ("ARI") |
| `logo` | String(400), nullable | snapshot URL |
| `color` | String(16), nullable | snapshot hex |
| `position` | SmallInt | 0 = primary; ordering |
| `created_at` | DateTime | |

- Unique `(user_id, sport, league, external_id)`.
- Cap **6** enforced in the service, not the DB.
- `user_id` type must match `User.id`, which is **`UUID(as_uuid=False)` (string)**
  — mirror it, don't use a native UUID column.
- New Alembic migration off the current head **`d4e5f6a7b8c9`** (copy the shape of
  `d4e5f6a7b8c9_user_consent.py`).
- **Register the model**: add `from app.models.favorite_team import FavoriteTeam
  # noqa: F401` to `api/auth/app/models/__init__.py`, or Flask-Migrate won't see
  it on the metadata (easy-to-miss step — `User` is registered there today).

## API (auth, prefix `/v1/platform/auth`)
- **`GET /me`** — add `favorite_teams: [{sport, league, external_id, name,
  abbreviation, logo, color, position}]` (ordered by `position`) to the response.
  **Add it in `svc.me()`'s response dict, NOT in `User.to_dict()`** — `to_dict()`
  is reused by `_issue_auth_response` (every login/verify/complete) and by the
  avatar/profile updates, so a joined query there taxes all of them. `/me` also
  fires on **every web bootstrap** (`AuthContext.tsx`), so keep this the single,
  deliberate eager-load spot. One fetch feeds the account editor.
- **`PUT /favorites/teams`** — replace the whole ordered list. Body: the array
  (≤6) of team snapshots the client assembled from the picker. Server validates
  the cap, dedups, rewrites rows with `position = index`. Add / remove / reorder
  / set-primary all collapse to "send the new list" — simplest correct contract,
  no per-item endpoints.
- **`GET /users/<id>/profile`** (JWT required, any authed user) — public profile
  for the dialog: `{ id, display_name, avatar_key, favorite_teams }`. This is the
  **first real public-profile endpoint** — today the profile dialog fetches
  nothing about the target and derives the H2H record client-side. Lazy fetch on
  dialog open; no list-payload bloat.
- (Optional, later) add `favorite_teams` to `POST /internal/users` so league/
  member lists can show a primary-team badge inline without N fetches. **Out of
  v1** — the dialog fetch covers it.

## Web
- **`web/lib/favorite-teams.ts`** (new client): `getMyFavorites()` (or read off
  `authApi.me()`), `saveFavorites(list)`, `getUserProfile(userId)`.
- **Account page** (`web/app/(app)/account/page.tsx`): new **"Favorite teams"**
  card. Manage UI (mobile-first — **no drag**, it's miserable on touch):
  - Current list: team logo + name, a **"Make primary"** action (moves to front)
    and a remove (×). Primary gets a small "Primary" chip.
  - **"Add team"** opens a picker → sport (`GET /sports`) → league
    (`GET /sports/<sport>/leagues`) → **team grid** (`fetchTeams`, logos). Tap to
    add (appends). Disabled once at 6.
  - Save = `PUT /favorites/teams` with the assembled ordered list.
- **`web/components/team-picker.tsx`** (new): the sport→league→team drill-down,
  reused by the account card (and available to the league-create sports step
  later). Biggest new UI piece; built on existing catalog fetches.
- **`UserProfileDialog`** (`web/components/user-profile-dialog.tsx`): on open,
  `getUserProfile(userId)`; render the favorite teams as **"Brand pills"**
  (DECIDED — see mock below) above/below the existing H2H record. Falls back
  gracefully (empty → show nothing).
- **✅ DECIDED — display = Brand pills.** Each team is a rounded pill wearing its
  own brand color: `logo (≈20px) + short name` (last word of the team name, e.g.
  "Cardinals"), border + faint fill tinted from the team `color`
  (`color-mix(... 12%, card)`), and the **primary** pill filled **solid** in the
  team color with white text, ordered first. Pills wrap; no horizontal scroll.
  Reference mock: `scratchpad/favorite-teams-samples.html` (the "Brand pills"
  variant). This is the one favorite-teams presentation — reuse it everywhere
  teams are shown.
- **`UserMiniCard`** (friend/member lists): show the **primary** team only, as a
  single Brand pill (or its bare logo) beside the name — consistent with the
  dialog. Gated on the profile payload being on hand to avoid per-row fetches
  (i.e. only once `favorite_teams` rides the list endpoint / `/internal/users`,
  which is the "Optional, later" item above). Until then, teams show in the
  dialog only.

## Mobile notes
- Picker is a full-width drill-down (bottom-sheet or pushed view), ≥44px team
  rows, logos ~32–40px. No horizontal scroll — team grid wraps.
- Snapshots mean cards render instantly offline of ingestor.

## Considerations & edge cases (resolved 2026-08-14)
- **Privacy** — favorites render on the PUBLIC profile (any user via
  `GET /users/<id>/profile`). v1 = **public, no toggle** (fits a social betting
  app); a "show my teams" toggle is a later add if anyone asks.
- **Reorder scope** — only **"Make primary"** (moves a team to the front). No full
  drag reorder (bad on touch). Non-primary order = insertion order.
- **Leagues offered — ✅ DECIDED: all active team leagues** (no curation): the
  seven mainstream today (NFL, College Football, NBA, MLB, NHL, EPL, MLS) plus any
  active team sport-league the catalog adds. The disabled non-team sports
  (golf/racing/MMA/cricket) are irrelevant — you favorite teams, not players.
- **Big leagues need in-grid search** — College Football is 130+ teams, so the
  drill-down's **team-grid step needs a search box** (name/abbr filter), not just
  a scrollable tile wall. Required now that College Football is in scope.
- **Catalog hygiene** — filter **all-star / placeholder pseudo-teams** ("American
  All-Stars", conference squads, TBD) out of the picker. Handle the
  **quota-exhausted / empty-sync** case gracefully: show cached teams + a soft
  "couldn't refresh" note, never an empty grid (the teams fetch already returns a
  `sync_error` flag alongside cached rows).
- **Pill name collisions** — the pill shows the last word ("Cardinals"). When
  that isn't unique in the person's own list (NY Rangers + Texas Rangers → two
  "Rangers"; Red Sox + White Sox → two "Sox"), fall back to the **abbreviation**
  (or full name); the logo also disambiguates. Compute uniqueness per-list at
  render.
- **Snapshot staleness** — teams rebrand/relocate/rotate logos ("Athletics" lost
  its city). **Refresh a favorite's snapshot when its owner's profile is fetched**
  (cheap, on-read) and on the periodic reconcile. The snapshot always stores
  `color` so the initials-crest fallback works when a logo URL dies.
- **Add flow — ✅ DECIDED: drill-down.** The Account card is flat (pills + manage
  list); **"+ Add team" opens a bottom sheet** (not an inline expand — avoids
  reflow jank) that drills **sport → league → team grid**. Tap a team to add;
  added teams show a ✓ and lock; back arrows walk up; the sheet stays open to add
  several. The flattened search-first variant is **not** used. Note the team-grid
  level still needs an **in-grid search box** for big leagues (College Football
  130+). Reference mock: `scratchpad/add-favorite-teams.html` (Drill-down mode).

## No-favorites nudge (v1) — ✅ DECIDED
No favorites prompt at signup (keeps the signup flow lean). Instead, a user who
still has **zero favorite teams** gets a **one-time notification** — *"Pick your
favorite teams"* — with a **deep link to the Account favorites card** (`/account`,
ideally auto-opening the Add sheet). Mechanics: the `users` service checks on a
periodic tick (scheduler → new `users` `/internal/tick`) for accounts older than
~1 day with no favorites and not yet nudged, and calls notifications
`/internal/notify` once, deduped by `dedup_key=favorites_nudge:<user_id>` so it
never repeats. It naturally stops mattering once they add a team. Frequency
(once vs a gentle re-nudge) is a minor open detail — **default: once**.

## Bet recommendations from favorites (the payoff — 🗄️ SHELVED; design kept)
**Parked for now** (revisit after favorites ship) — the design + audit below are
retained so it's ready when we pick it up. Favorites aren't a profile badge; the
point is to **match rivals for head-to-head bets**. When an upcoming event pits
Team A vs Team B and one league member favors A while another favors B, recommend
a wager between them.

- **Scope:** **head-to-head (money) leagues only** — pick'em is you-vs-field, not
  member-vs-member. Play-money / even-money per the launch gating.
- **Where it computes:** the **contests** service — it already owns wagers + the
  H2H gate + `league_context` (which hands it `sport_league_ids`), and talks to the
  ingestor (single-event today). It additionally needs: the league's **active
  member ids** (gap #1), **upcoming events** for those sport-leagues (gap #2, via a
  new wrapper over the ingestor's existing `GET /events`), and each member's
  **favorites** in one batch from the profile store (`/internal/profiles`, or
  `/internal/users` once favorites ride it). See the Audit below for the gap list.
- **Matching (per league):**
  1. For each upcoming event in a sport the league bets on, read
     `home_team` / `away_team` (+ abbr).
  2. Map a member's favorite to a side by the **same join the ingestor uses** —
     `(league, abbreviation)` then `(league, name)` — because events carry team
     *strings*, not ids. The snapshot's `abbreviation` + `league` make this work
     with **no team-id FK**.
  3. A member on the home team + a member on the away team = a **rivalry pair**.
     Skip if they favor the same team, either isn't an active member, or a wager
     already exists between them on that event.
  4. Rank: soonest game first; a **primary** favorite outranks a secondary one;
     fewer existing bets between the pair.
- **Surfacing:** a **"Rivalry challenges"** section on the H2H league page —
  cards like *"🏈 Cardinals @ Bills · Sun 1:00 — you back the Cardinals, Marcus
  backs the Bills. Challenge him?"* with a one-tap **Propose bet** that pre-fills
  the slip (your favorite's side, acceptor = that member, stake = league
  default/min, editable). Optional nudge notification: *"3 members back teams
  playing this week."*
- **Never auto-place** — recommendations only pre-fill a proposal the user
  confirms. (Bets-in-chat stays DM-only; this is a suggestion surface, not a bet.)
- **Viewer-centric** — recs are computed *for the viewer* ("you back X, Marcus
  backs Y — challenge him"), so when they tap Propose the authenticated caller is
  the proposer. This sidesteps proposing on another user's behalf (propose derives
  `proposer_id` from the JWT), so no cross-user proposal path is needed.

### Audit — buildable, but 4 net-new pieces (verified 2026-08-14)
Fully supported by existing code: event team shape (strings + abbr, no id), the
favorite→side join keys (`attach_logos` uses `(league, abbr.upper())` then
`(league, name)` — `service_events.py`), the propose input surface
(`league_id, acceptor_id, event_id, side=home|away, amount_cents,
bet_type=moneyline`), and the **head-to-head gate** (`_validate_context` rejects
non-`head_to_head` before any wager). Gaps to build:
1. **`leagues` — new internal endpoint to list a league's active member ids.**
   `contests` only has `are_comembers` (pairwise) + `league_context` (settings, no
   roster); the DB has `LeagueMember(status=ACTIVE)` but it isn't exposed as a
   list. New `/internal/leagues/<id>/members`.
2. **`contests` — new helper to fetch upcoming events.** Today contests only
   fetches a *single* event by id (`get_event`); the client supplies `event_id`.
   The ingestor **already** exposes `GET /events?sport_league_id=…&status=scheduled&starts_after=…`
   (ordered by start) — and `league_context` already returns `sport_league_ids` —
   so this is a new contests-side wrapper, **no new ingestor endpoint**.
3. **Favorites data source** — the whole Feature 1 above; nothing favorite-related
   exists in `api/` yet. This is the hard prerequisite.
4. **`contests` — dedup query** on `(event_id, proposer_id, acceptor_id)` across
   OPEN/ACCEPTED before recommending/proposing. No such query or uniqueness guard
   exists today (propose never checks for an existing wager).

## Cross-cutting
- Routes live under the existing `auth` prefix (`/v1/platform/auth`) — **no
  gateway `default.conf` change**, `web/lib/api-paths.ts` untouched.
- One migration: `auth` creates `user_favorite_teams`. Applied in prod via the
  pinned-`:sha` one-off `run-task` procedure.
- No Next.js build on the 2 GB host; use lint + memory-bounded `tsc`.
- Commit each edit; **deploy only when told**.

## Build sequence
1. **Backend** (auth: model + migration + `PUT /favorites/teams` + `/me`
   extension + `GET /users/<id>/profile`).
2. **Web** (`team-picker`, account "Favorite teams" card, profile-dialog row).
3. **Polish** (optional mini-card primary-team badge — pending the open question).

## BUILT + audited (Track B, 2026-08-14)
Built in the `users` service (not `auth`), per the split. Commits: `280e418`
(B1 backend), `38c1891` (B2 web), `030d626` (B3 nudge), `2b81aca` (full-audit
fixes). Per-phase + a 2-reviewer full audit ran; fixes applied (400-not-500 on
bad input; account-card data-loss guard + 44px targets; nudge batch/timeout +
partial index; picker error states; nudge deep-link anchor). **No functional
bugs remained at the gate.**

### Deploy (Track B — only after Track A is fully live)
B sits on top of the `users` service, so deploy it as one unit once A's 3 phases
are live. Order:
1. **`flask db upgrade` on `users`** — applies `c2d3e4f5a6b7` (`favorites_nudged_at`
   + the partial index `ix_profiles_pending_nudge`). Additive + online-safe;
   note the index build is **not `CONCURRENTLY`**, so it briefly locks `profiles`
   writes — negligible at current scale, watch it if the table grows.
2. **Roll `users`** (B1 favorites endpoints + B3 `/internal/tick`) — after the
   migration (the code needs the column).
3. **Roll `webui`** (B2) — any time after B1 is live.
4. **Roll `scheduler`** (so it ticks `users`), with notifications reachable.

**Prod env (ALB form — silent no-op if unset):** scheduler `USERS_URL` =
`https://waygerz.com/v1/platform/users`; users `INTERNAL_NOTIFICATIONS_URL` =
`https://waygerz.com/v1/platform/notifications`; shared `JWT_SECRET_KEY` +
`INTERNAL_TOKEN` identical across users/scheduler/notifications.

## Audit (verified against code, 2026-08-14)
All claims checked against the real `auth` service. Verdicts:
- **`GET /me` / `to_dict()`** — VERIFIED. `/me` → `svc.me()` (`service_auth.py`
  `me()`) → `{"user": user.to_dict()}`; `to_dict()` (`user.py`) currently returns
  `id, phone, display_name, avatar_key, created_at, tos_accepted_at,
  tos_version`. Confirmed `to_dict()` is shared across many responses → add
  favorites in the `me()` response instead (folded in above).
- **Public profile route** — VERIFIED no collision. Existing public routes:
  `/health`, `/otp/{start,verify,complete}`, `GET|PATCH /me`, `PATCH /me/avatar`,
  refresh/logout. No `/users/*` in the public blueprint (only `POST
  /internal/users`, different prefix+method). Add `GET /users/<id>/profile` in
  `route_auth.py`.
- **Model/migration fit** — VERIFIED. Models under `app/models/`, linear Alembic
  chain (head `d4e5f6a7b8c9`), `User.id` is a **string** UUID, and `__init__.py`
  central registration is required (folded in above).
- **Internal `/internal/users` reuse** — the existing service→service lookup
  returns `{id, display_name, avatar_key, phone}`; the optional v1-out extension
  to carry `favorite_teams` would slot in there.

## Personalization consumers (roadmap — why the table exists)
Favorites are a data source; these consumers turn it into product value. Each is
a later phase and **none needs new storage** — just readers of the table:
- **Bet recommendations** (see the section above) — the headline consumer.
- **Sort favorite teams' games to the top** of the sports browse + league event
  lists.
- **"Your team plays tonight"** notifications (notifications service).
- **Suggest the matching global pick'em league** (NFL fan → NFL Pick'em Global) —
  synergy with `FEATURE_PLAN_global_leagues.md`; a natural onboarding prompt right
  after a user picks favorites.
- Deferred plumbing: `favorite_teams` on `/internal/users` for inline member-list
  team badges; periodic snapshot re-sync against the ingestor.
