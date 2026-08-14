# Feature plan: Split `auth` → `auth` (credentials) + new `users` service (profile)

Architectural refactor. Separates the **identity/security** concern from the
**profile** concern that has been squatting in `auth.users`. Enables a clean home
for favorite teams (`FEATURE_PLAN_favorite_teams.md` now lands *here*, see bottom)
and future profile surfaces (bio, settings, privacy). No code written yet.

> **✅ Build order — this ships FIRST** (decided). Favorites and everything
> profile-related depend on the `users` service existing, so this refactor is the
> first thing built, before the favorites feature. The new `users` service will
> also own a `/internal/tick` (scheduler-driven) for the no-favorites nudge — see
> the favorites plan.

**Verified against the real code (2026-08-14).** No cross-service FKs exist; the
split is a column-split keyed by the shared `id`, not a wholesale table move.

---

## Why a split (and why not just rename the schema)
`auth` **must keep** `phone` + `pin_hash` + consent — it reads `phone` on every
OTP verify (`service_auth.py:201`), enforces phone uniqueness (`:231`), and bakes
`phone` into JWT claims (`:118,122-123`). So it can't give up the row. The clean
DDD boundary is:

| Stays in `auth` (credentials/security) | Moves to `users` (profile) |
|---|---|
| `id` (JWT identity, shared key) | `display_name` |
| `phone`, `pin_hash` | `avatar_key` |
| `tos_accepted_at`, `tos_version` | *(new)* `favorite_teams` |
| `sms_transactional_consent`, `sms_marketing_consent` | *(future: bio, prefs…)* |
| `created_at` | |

Both rows share the **same `id`** (auth mints it; `User.id` is
`UUID(as_uuid=False)` — a **string**). `users.profiles.user_id` = that id, soft
reference, **no cross-schema FK** (matches how every service already stores
`user_id`).

---

## New `users` service
Standard Flask service (clone `api/auth` shape): `wsgi.py`, `create_app`,
`app/{routes,controllers,services,models,utils}`, own migrations, own schema
`users`. Compose host `users:8000`, group `platform`, prefix
**`/v1/platform/users`**. Validates the same shared-secret JWT locally (no gateway
auth wiring — same model as every service).

### Tables (schema `users`)
- **`profiles`**: `user_id` (string UUID, PK — the auth id), `display_name`
  String(64) not null, `avatar_key` String(512) nullable, `created_at`,
  `updated_at`.
- **`favorite_teams`** (from the favorites plan, relocated here): `id` PK,
  `user_id` (string UUID, indexed), `sport`, `league`, `external_id`, `name`,
  `abbreviation`, `logo`, `color`, `position`. Unique `(user_id, sport, league,
  external_id)`; cap 6 in service. Register both models in `app/models/__init__.py`.

### Endpoints
- **`GET /profile`** (JWT) — own profile: `{ user_id, display_name, avatar_key,
  favorite_teams }`.
- **`PATCH /profile`** (JWT) — update `display_name` (moves `update_profile`'s
  64-char guard here).
- **`PATCH /profile/avatar`** (JWT) — set `avatar_key`; **moves the
  `members/avatars/` prefix guard here** (media is unchanged; `users` only needs
  the prefix string).
- **`PUT /favorites/teams`** (JWT) — replace ordered list (≤6).
- **`GET /users/<id>/profile`** (JWT, any user) — public profile for the profile
  dialog: `{ user_id, display_name, avatar_key, favorite_teams }`.
- **`POST /internal/profiles`** (`@internal_only`) — batch resolve ids →
  `[{ user_id, display_name, avatar_key }]`. This is the replacement for the
  profile half of auth's `/internal/users`, consumed by the 5 services below.

---

## `auth` changes
- **Model/migration**: drop `display_name` + `avatar_key` from `users` (final
  contract phase — see rollout). Remove them from `to_dict()`.
- **`/internal/users`**: keep it, but it now returns **`{ id, phone }`** only
  (profile fields gone). Its sole remaining consumer is notifications (phone).
- **`GET /me`**: returns credentials only (`id, phone, created_at, tos_*`).
- **Signup (`otp_complete`)** and **`flask create-user`**: after creating the
  auth row, **create the matching `users.profiles` row** with the entered
  `display_name` via `POST /internal/profiles` (see cross-service creation below).
- Delete `set_avatar` / `update_profile` (moved to `users`); drop `PATCH /me`
  (display_name) and `PATCH /me/avatar` from auth's routes.

---

## The 6 internal consumers (repoint)
Each has a local `resolve_users*` helper POSTing to `{AUTH_URL}/internal/users`.
Five read **name/avatar** → repoint base URL to the new **`USERS_URL`** and call
`/internal/profiles`; one reads **phone** → unchanged.

| Service | Helper | Reads | Action |
|---|---|---|---|
| friends | `service_friends.py:28-40` | name+avatar | → `USERS_URL/internal/profiles` |
| leagues | `service_leagues.py:147-159` | name+avatar | → `USERS_URL/internal/profiles` |
| contests | `service_wagers.py:163-173` | name+avatar | → `USERS_URL/internal/profiles` |
| messaging | `service_messaging.py:29-41` | name+avatar | → `USERS_URL/internal/profiles` |
| comments | `service_comments.py:25-36` | name only | → `USERS_URL/internal/profiles` |
| **notifications** | `service_internal.py:63-79` | **phone only** | **unchanged** (stays on `auth/internal/users`) |

Each of the 5 needs a `USERS_URL` config entry (the `https://waygerz.com` ALB
form in prod — same internal-URL footgun as notifications; compose default
silently no-ops). Return shape stays `{display_name, avatar_key}` so **consumer
call sites don't change**, only the base URL.

**Denormalized snapshots need no rewire**: notifications stores point-in-time
`actor_name`/`actor_avatar_key` copies (`notification.py:30-31`), written by the
triggering service — stale-by-design, not live joins. (Noted: they now snapshot
users-owned data; acceptable.)

---

## Avatar flow — media unchanged
Media still mints `members/avatars/...` keys, presigns upload/display, prunes to
5. Only the **consumer of the key** moves: `avatar_key` column + `set_avatar` +
the prefix guard → `users`. `users` needs the prefix string only. No media edit.

---

## Web changes — confined to the own-user `/me` path
Peer names/avatars are **denormalized server-side** into friends/leagues/
messaging/wagers/notifications payloads; the web has **no per-user profile
fetch**. So the only web ripple is the signed-in user's own object:
- **`web/lib/auth.ts`**: `AuthUser` loses `display_name`/`avatar_key` from the
  auth `/me`; add a **`web/lib/users.ts`** client (`getMyProfile`,
  `updateProfile`, `setAvatar`, `saveFavorites`, `getUserProfile`) hitting
  `/v1/platform/users`.
- **`web/auth/AuthContext.tsx`**: on bootstrap, fetch **both** `authApi.me()`
  (creds) and `usersApi.getMyProfile()` (profile) in parallel and **merge into
  one `user` object** that still carries `display_name` + `avatar_key`. The
  `setAvatar`/`updateProfile` mutators repoint to `usersApi`.
- **Result**: the ~10 own-user render sites (profile-menu, header-toolbar,
  bottom-nav, account page, pending-link-banner, league overview) **stay
  unchanged** because the merged `user` keeps both fields.
- **`web/lib/api-paths.ts`**: add `users: '/v1/platform/users'`.
- JWT/cookies/`proxy.ts` **untouched** (auth still mints/refreshes; profile isn't
  in the token).

---

## Gateway + config
- **`api/gateway/conf.d/default.conf`**: add one block beside the other
  `/v1/platform/*` routes (before the `location /` catch-all):
  `location /api/v1/platform/users { proxy_pass http://users:8000/v1/platform/users; }`.
  `/internal/*` stays **off** the gateway (compose/ALB internal only).
- **`api/docker-compose.yml`**: add the `users` service (build `./users`, same
  env pattern, `DB_SCHEMA=users`, shared `JWT_SECRET_KEY`, `INTERNAL_TOKEN`).
- **New config keys**: `USERS_URL` in the 5 consumer services + web
  `api-paths.ts`; `users` needs `INTERNAL_*` (for signup-time creation callback
  is inbound only) and the media avatar prefix.
- ECR repo `waygerz/users` + ECS service + `users/taskdef.json` (CI `all` +
  service list).

---

## Cross-service profile creation at signup (the one hard part)
`otp_complete` (`service_auth.py:234`) creates the auth row + `display_name` in
one transaction today. Post-split it must also create the `users.profiles` row.
Chosen approach (no true distributed txn, tiny scale):
1. Create the **auth** row (identity), commit.
2. Call **`users` `POST /internal/profiles`** (create) with `{ id, display_name }`.
3. On failure: **delete the auth row and return 503 "try again"** so signup is
   all-or-nothing from the user's view (clean retry). *(Alternative considered:
   lazy profile creation on first read — rejected because `display_name` is
   user-entered at signup and would be lost.)*
- `flask create-user` (bypasses `otp_complete`) must make the same second call —
  same code path/helper.
- This is a **new outbound call from auth → users** (auth's only coupling to
  users; it does **not** call users on `/me` or reads — web merges those).

---

## Data migration + rollout (expand → migrate → contract; no flag day)
Never break prod. Three deploys:

**1. Expand** — stand up `users` (schema, tables), **backfill** `profiles` from
`auth.users` (copy `id→user_id, display_name, avatar_key`) via a one-off
`run-task`. `users` serves `/profile` + `/internal/profiles`. **auth still owns
and serves its columns** (nothing repointed yet). Signup **dual-writes** (auth
row + `users.profiles`). Web still reads profile off auth `/me`. Verify parity.

**2. Migrate reads** — repoint the 5 consumers + web (`AuthContext` merge) to
`users`. Writes go to `users` (auth stops mutating profile). Deploy + verify all
surfaces (cards, account edit, avatar, member lists).

**3. Contract** — drop `display_name`/`avatar_key` from `auth.users` (final
migration); trim auth's `/internal/users` to `{id, phone}`; remove auth's profile
routes. Deploy.

Rollback: each phase is independently revertible; the columns aren't dropped
until phase 3, after reads are proven on `users`.

---

## Favorite teams — now lands in `users`, not `auth`
`FEATURE_PLAN_favorite_teams.md` is **superseded on the storage/endpoint axis**:
table is **`users.favorite_teams`**, endpoints are under `/v1/platform/users`
(`PUT /favorites/teams`, `GET /users/<id>/profile`, `GET /profile` carries
favorites). Everything else in that plan (snapshot approach, ingestor `teams`
source, `team-picker`, account card, profile-dialog row, mobile notes) is
unchanged. Build favorites **after** phase 2 (once `users` owns profile) — or
fold the `favorite_teams` table into the phase-1 `users` schema from the start.

---

## Risks / notes
- **Biggest risk is the data migration + signup dual-write** — a user created
  between phases must land in both stores; the expand-phase dual-write covers new
  signups, the backfill covers existing users. Verify counts match.
- **Latency**: two bootstrap fetches (auth + users) instead of one — parallel,
  negligible on mobile; keeps auth fully decoupled from profile (no auth→users
  hop on reads).
- **Memory**: an **11th container** on the 2 GB host. Confirm headroom before
  standing it up (it's a light service — 1 gunicorn worker like the rest).
- Standing constraints: commit each edit; **deploy only when told**; migrations +
  backfill via the pinned-`:sha` one-off `run-task`.

## Decisions (locked 2026-08-14)
1. ✅ **Service name = `users`** (schema `users`, prefix `/v1/platform/users`).
2. ✅ **Own-user `/me` = two fetches merged in web.** `AuthContext` fetches
   `authApi.me()` (creds) + `usersApi.getMyProfile()` (profile) in parallel and
   merges into one `user`. Auth is **fully decoupled** — it never calls `users`
   on reads (its only outbound call to `users` is profile *creation* at signup).
3. ✅ **Fold `favorite_teams` into the phase-1 `users` schema from the start.**
   Both `profiles` and `favorite_teams` tables ship in the initial `users`
   migration; the favorites *feature/UI* can still land after phase 2, but the
   table exists day one (no later migration).
4. ✅ **`flask create-user` MUST make the second call too** — this is *required*,
   not optional (unlike the global-leagues auto-enroll): a user with no
   `users.profiles` row has no `display_name` at all and breaks `/profile` +
   every consumer. Extract a shared "create auth+profile" helper both
   `otp_complete` and the CLI call. (The *global-leagues auto-enroll* CLI
   question is separate and stays optional.)
