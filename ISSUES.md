# Issues

Findings from a read-only audit of `api/`, `web/` and `mobile/` (2026-09-18).
Items marked **(verified)** were confirmed by reading the code directly; the rest
come from the audit pass and should be double-checked before acting on them.

## High

- [x] **Scheduler ticks likely 404 (verified).**
  `api/scheduler/scheduler.py:15-17` defaults `CONTESTS_URL`, `LEAGUES_URL` and
  `INGESTOR_URL` to bare `http://<svc>:8000`, then appends `/internal/tick`.
  Those services mount internal routes at `api_prefix() + "/internal"`
  (e.g. `api/contests/app/routes/__init__.py:24`), so the real path is
  `/v1/<group>/<svc>/internal/tick`. Only the `users` job carries the prefix.
  No scheduler taskdef is in the repo, so unless prod sets these env vars
  elsewhere, wager settlement, pick'em period advancement and ingest ticks don't
  run. Check CloudWatch for `[scheduler] contests error: 404`.
  **Prod was unaffected:** the live `waygerz-scheduler:7` task def sets the
  prefixed `CONTESTS_URL`/`LEAGUES_URL`/`INGESTOR_URL`. Only compose/local used
  the broken defaults.
  **Fixed:** defaults are now `http://contests:8000/v1/gameplay/contests`,
  `http://leagues:8000/v1/gameplay/leagues`,
  `http://ingestor:8000/v1/platform/ingestor`.

- [x] **Unauthenticated `POST /v1/platform/ingestor/events/sync` (verified).**
  `api/ingestor/app/routes/route_events.py:38` has no JWT or internal-token
  guard and is publicly routed. `force=true` bypasses the upstream cache, so
  anyone can trigger external ESPN/odds API fetches.
  **Fixed:** now `@internal_only` (no client calls it).

- [x] **Secrets silently fall back to dev defaults.** Every service's
  `config.py` falls back to `dev-secret-change-me`, `dev-jwt-secret-change-me`
  and `dev-internal-token` when env vars are unset. Only `twilio` fails fast.
  A missing SSM secret in prod would run with a known JWT key.
  **Fixed:** `require_prod_secrets()` in each service's `create_app` refuses to boot
  when `APP_ENV=production` and `JWT_SECRET_KEY`/`INTERNAL_TOKEN` are unset or dev
  defaults (`SECRET_KEY` is never read, so it's not enforced). **Before deploying,
  confirm every ECS task def sets both** — only `notifications/taskdef.json` is in
  the repo.

## Medium

- [x] **Web refresh race.** `tryRefreshSession` (`web/lib/auth.ts`, called from
  `web/auth/AuthContext.tsx`) calls `/refresh` outside the single-flight /
  cross-tab lock used by `apiFetch` (`web/lib/http.ts`). With refresh-token
  rotation, concurrent refreshes can trigger reuse detection and log users out.
  **Fixed:** `tryRefreshSession` now goes through the exported `refreshSession()`
  lock; the unlocked `authApi.refresh` was removed.

- [x] **Mobile never recovers from an expired session.** Nothing catches
  `SessionExpired` to return to login; screens just show `ErrorState`.
  `bootstrap()` also treats a network error as signed-in with `user = null`
  (`mobile/lib/auth/auth_controller.dart:39-41`).
  **Fixed:** `ApiClient.onSessionExpired` signs out via `AuthController` (routes to
  login from any screen); bootstrap retries `/me` in the background after a
  network error.

- [x] **CI only tests 4 of 12 services.** `.github/workflows/test.yml` runs pytest
  for auth, contests, leagues and ingestor. users, friends, comments, messaging,
  wallet, media, notifications and twilio have `tests/` that never run.
  **Fixed:** `test.yml` matrix now covers all 12 services (first run may surface
  failures in suites that never ran in CI).

- [x] **Messaging accepts JWT in the query string** (`api/messaging/app/utils/config.py:30,38`)
  for SSE. Tokens can end up in ALB/proxy access logs.
  **Fixed:** removed `query_string` — nothing used it (web SSE authenticates with
  cookies; a future mobile stream can send the `Authorization` header).

- [x] **Open-redirect gap.** `safeReturnPath` (`web/auth/return-path.ts:2`) doesn't
  reject `/\evil.com`.
  **Fixed:** resolves with `new URL()` and requires same origin.

- [x] **`internal_only` uses `!=` for token comparison** (`app/utils/guards.py` in
  each service). **Fixed:** `hmac.compare_digest`.

- [x] **Web ingestor/ESPN clients bypass `apiFetch`.** `web/lib/ingestor.ts:17`
  and `web/lib/espn.ts:108,115` use raw `fetch` (no credentials, no 401 refresh).
  Fine only while those endpoints stay public.
  **Won't fix:** the ingestor read endpoints are public by design.

## Low / cleanup

### Backend
- [x] `docker-compose.yml`: gateway `depends_on` is missing users, notifications
  and twilio (nginx proxies to them); scheduler doesn't depend on ingestor. The
  memory table (lines 13-31) omits users/notifications/twilio; header comment
  (line 38) still says `../webui`.
  **Fixed (b8a6a04).**
- [x] `api/gateway/conf.d/default.conf` header comment describes old routes
  (`/auth`, `/events`, `/wagers`, "React SPA").
  **Fixed (b8a6a04).**
- [x] No `api/.env.example`; compose fails on a fresh checkout.
  **Fixed (b8a6a04):** `docker compose config` validates with it.
- [x] `notifications/taskdef.json` and `web/taskdef.json` deploy `:latest` and
  hardcode the AWS account ID. Only these two services support `register_taskdef`.
  **Fixed (b8a6a04):** every deploy now registers a revision pinned to the commit's image; the files use `__ACCOUNT_ID__`/`__IMAGE__` placeholders.
- [x] Duplicated code in every service: `guards.py`, `wsgi.py`, `migrations/env.py`,
  `config.py`. Two naming styles for peer URLs (`INTERNAL_*_URL` attrs in auth vs
  `*_URL` attrs elsewhere).
  **Guarded (b8a6a04):** `scripts/check_shared_files.py` (a CI job) fails if guards.py / wsgi.py / Alembic env drift from api/auth's. The two peer-URL naming styles remain.
- [x] Ingestor Dockerfile has no `--worker-class` (sync worker, unlike the others).
  **Moot:** the tick no longer runs in the request thread (a14771c).

### Web
- [ ] About 35–40% of non-page code is unused Metronic template code: about 50 of 79
  `components/ui` files (about 9k lines; `file-upload.tsx` is 0 bytes), 5 hooks,
  `config/general.config.ts`, `components/shell/logo.tsx`, `lib/dom.ts`.
- [ ] About 25 MB of demo assets in `web/public/media`; only `/media/app/mini-logo.svg`
  is used.
- [ ] Unused deps: apexcharts, react-apexcharts, leaflet, react-leaflet,
  react-i18next, @remixicon/react, date-fns, react-wrap-balancer,
  @tanstack/react-query-devtools, react-aspect-ratio (plus several only used by
  dead UI files: dnd-kit, react-table, headless-tree, embla, recharts, motion).
- [ ] `styles/config.metronic.css` imports apexcharts/leaflet/rating/demo1 CSS and
  `image-input.css` twice.
- [ ] Template leftovers: `package.json` name `metronic-react-starter-kit`,
  stock `README.md`, `documentation.html`, eslint ignore for `prisma/**`,
  `app/api/health/route.ts` reports `service: 'metronic-react-starter-kit'`.
- [x] `app/(app)/leagues/[id]/sections.tsx` is 3,723 lines — split per tab.
  **Fixed (bf0c59c):** 12 modules under `_sections/`, none over 800 lines.
- [x] 15 copies of `process.env.NEXT_PUBLIC_API_URL ?? ''` and a `req()` wrapper
  per lib module; `hasSessionMarker` duplicated with different logic
  (`lib/http.ts:28` vs `lib/session.ts:4`).
  **Fixed:** one `API_BASE` (lib/api-paths.ts) + shared `apiRequest`; one `hasSessionMarker` (lib/session.ts).
- [x] `tsconfig.json`: `target es5`, `moduleResolution node10`, path alias to
  nonexistent `./app/components/*`. `eslint-config-next` 15.5 vs next 16.1.6;
  `@eslint/eslintrc` used but not declared.
  **Fixed:** ES2017 / bundler resolution, dead alias gone; eslint-config-next 16 flat config (no FlatCompat).
- [x] `build:staging` needs a nonexistent `.env.staging` and uses `cp` (breaks on Windows).
  **Fixed:** script removed.
- [x] Privacy/terms titles double-suffix ("· Waygerz | Waygerz"); `/logo.png`
  img tags ignore `basePath`.
  **Fixed:** single brand in titles (incl. /welcome); logos + favicons go through `toAbsoluteUrl` (basePath).
- [x] `favorites.ts` is still localStorage-only (users service now owns favorites).
  **Fixed:** pinned leagues now live in the users service (`GET`/`PUT /favorites/leagues`, private to the user, purged on account delete); web imports any browser-saved pins once, and mobile has the same client.

### Mobile
- [x] `PushService` is never called; Firebase init is only a comment in `main.dart`.
  **Deferred:** push is out of scope for v1 (MOBILE_STORE_LAUNCH_PLAN.md).
- [x] Query strings in `wallet_api.dart` / `wagers_api.dart` aren't URL-encoded
  (`account=league:<id>`).
  **Fixed (1f96ac7):** `withQuery()` encodes them.
- [x] API objects created inline per build (e.g. `NotificationsApi` in
  `home_screen.dart:24`).
  **Fixed (1f96ac7).**
- [x] `mobile/.gitignore` ignores `pubspec.lock` — apps should commit it.
- [x] `mobile/README.md` is stale: says OTP is never returned (the app reads
  `dev_otp`), lists only 2 model classes (there are 8).
  **Fixed (1f96ac7).**
- [ ] Feature gaps vs web (see `.docs/pending/MOBILE_PARITY_PLAN.md`): pick
  submission, propose bet, friends, messaging, avatars, deep links, unread badges,
  wallet ledger, notification prefs, push.
- [ ] Android SDK setup on the dev machine: cmdline-tools missing, licenses not
  accepted (`flutter doctor`).

### Docs
- [x] `CLAUDE.md`: lists 10 services (missing users, twilio); says `webui/` /
  `../webui` (it's `web/`); says scheduler ticks 3 services (it's 4); references a
  `wagers` service (it's contests); says proxy gates on `waygerz_access` only
  (it accepts access or refresh); describes SSR via `API_INTERNAL_URL` (nothing
  reads it; no SSR fetches); mentions `i18n/` (doesn't exist).
- [x] `AGENTS.md`: missing twilio.
- [x] `build-and-deploy.yml` references `_docs/INF_PROD.md`, which doesn't exist.
  **Fixed (b8a6a04).**

## Added 2026-09-18 (after the audit)

### Fixed
- [x] **Scores froze; unplayed games became 0-0 draws.** ESPN rejects
  `dates=YYYYMMDD-YYYYMMDD` (HTTP 400) since ~2026-09-15; the reaper then
  finalized games from ESPN's pre-game "0" placeholders. Per-day fetches, a
  catch-up pass, and a reaper that only scores games it saw live (855dbb9).
  36 games backfilled with `flask rescore`; picks re-graded (open weeks too).
- [x] **Spreads missing until 48h before kickoff.** ESPN's scoreboard carries
  DraftKings lines for free; they're now stored and refreshed for the next 7
  days (a54c7d7).
- [x] **Data-provider budgets.** Odds API paced to its 20K/mo plan with
  carry-forward and near-kickoff weighting; RTS (10K/mo) only fills gaps; quota
  report via `flask quota` / `/internal/quota` / hourly log (5591b11, 90c57ef).
- [x] **Ingestion performance.** Background tick (no more 504s), diff-only
  upserts, parallel ESPN fetches, batch event lookups for leagues/contests,
  capped DB pools in every service (a14771c, 77e51e2, ff516bc).

### Open
- [x] **Postgres `max_connections=30`** on `waygerz-data` (docker `pgsql`).
  **Fixed 2026-09-18:** container recreated with `max_connections=100` (same
  image, flags, volume). The host was launched by hand (no launch template/IaC)
  and user-data only runs at first boot, so rather than stopping the DB host to
  edit it, the canonical container commands (100) live in
  `.docs/complete/DATA_HOST.md` — build any new host from those.
- [x] **auth / friends / wallet / ingestor `INTERNAL_*_URL` pointed at
  `https://waygerz.com`** (unreachable from inside the VPC — confirmed when a
  one-off task timed out on it). **Fixed 2026-09-18:** removed from their task
  defs (auth:11, friends:7, wallet:4, ingestor:7) so the Service Connect mesh
  defaults apply. Ingestor also resized to 0.25 vCPU / 512 MB.
- [x] **8 bets pushed on fake 0-0 finals** — settled with `flask
  resettle-refunds --apply` (all $0; feed posts/notifications not sent).
- [x] **media and twilio weren't on Service Connect.** **Fixed 2026-09-18:**
  media (`waygerz-media:3`) now names its port `http` and registers as `media` in
  the `waygerz` namespace, and its unused public `INTERNAL_*_URL` are gone; auth
  was redeployed so its account-deletion purge (`http://media:8000`) resolves.
  twilio needs nothing: it makes no internal calls, and `TWILIO_WEBHOOK_BASE_URL`
  must stay public (Twilio signs requests against it).
- [x] **`CLAUDE.md` "AWS environment" section** described only the old EC2 dev
  host (`waygerz` profile). **Fixed:** documents the `waygerz_aws` profile too.
- [ ] **React Compiler lint warnings.** eslint-config-next 16 brings
  react-hooks v7; `set-state-in-effect` (24), `purity` (22) and `refs` (3) fire
  in 24 files and are set to `warn` in `web/eslint.config.mjs` until fixed.
