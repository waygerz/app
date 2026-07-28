# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`waygerz` is a social sports pick'em / head-to-head wagering app built as a
**Docker Compose stack of ~10 Flask microservices + a Next.js webui + an nginx
gateway + a poll-loop scheduler**, all on a single host (`t4g.small`, 2 GB RAM).
Images are built for `linux/arm64` and deployed to AWS ECS/ECR.

> **Doc drift warning:** `AGENTS.md` describes an `app/<name>/` directory layout
> and calls webui a "React + Vite SPA". It is stale. The backend services now
> live under **`api/`** and webui is **Next.js SSR on `:3000`** at the repo root
> (**`webui/`**). Trust `api/docker-compose.yml` and
> `api/gateway/conf.d/default.conf` over that doc.

## Layout

Top-level split: **`api/`** (backend), **`webui/`** (Next.js), and **`mobile/`**
(Flutter — iOS + Android). The repo **root** holds these plus docs and CI.

Every backend container lives under **`api/`**: each service is its own directory
(`api/auth/`, `api/friends/`, `api/comments/`, `api/messaging/`, `api/ingestor/`,
`api/wallet/`, `api/contests/`, `api/leagues/`, `api/media/`,
`api/notifications/`), plus `api/scheduler/` and `api/gateway/`.
`docker-compose.yml` lives **inside `api/`**; run compose from there. Backend
build contexts are relative to it (`./auth`, `./gateway`, …) and `.env` sits at
`api/.env`. webui is the exception — it lives at the repo root, so its compose
context is `../webui`.

ECR repo and ECS service names stay unversioned (`waygerz/<service>`, service
`<service>`). The directory layout is independent of the `/v1/{group}/{service}`
**API** path prefix, which is unchanged.

## Backend service architecture

Every Flask service is the **same shape** — `api/auth/` is the reference template:

```
<service>/
  wsgi.py                 # `app = create_app()`; gunicorn entrypoint (:8000, 1 worker)
  app/__init__.py         # create_app() factory: init db/migrate/jwt/cors/redis, register blueprints, CLI cmds
  app/extensions.py       # shared db, migrate, jwt, cors, redis singletons
  app/utils/config.py     # Config class, all env-driven
  app/routes/             # Blueprints — thin URL→controller wiring only
  app/controllers/        # request/response handling
  app/services/           # business logic (service_*.py)
  app/models/             # SQLAlchemy models
  migrations/             # Alembic (Flask-Migrate), per-service
  tests/                  # pytest
```

Conventions that matter across all services:

- **One Postgres schema per service.** `Config` sets
  `search_path=<DB_SCHEMA>` via `SQLALCHEMY_ENGINE_OPTIONS`. All services share
  one database; isolation is by schema (`auth`, `wallet`, `leagues`, …). Never
  cross-query another service's schema — go through its API.
- **API mounts at `/v1/{SERVICE_GROUP}/{SERVICE_NAME}`** — see
  `Config.api_prefix()`. Groups are `platform` / `social` / `gameplay`. This
  prefix must stay in sync with the gateway routes and `webui/lib/api-paths.ts`.
- **Auth is decentralized JWT.** `auth` mints the JWT; every service verifies it
  locally with the shared `JWT_SECRET_KEY` (flask-jwt-extended). There is **no**
  central auth check in the gateway — it just forwards the `Authorization`
  header / cookies. Web tokens live in HttpOnly cookies `waygerz_access` /
  `waygerz_refresh`. **Native clients** send `X-Client-Type: mobile` on
  login/verify/complete/refresh to receive `access_token` + `refresh_token` in
  the JSON body instead (refresh accepts the token from the body too); every
  service already verifies `Authorization: Bearer` via `locations=["cookies","headers"]`.
- **Internal endpoints are private to the compose network.** Routes under
  `/internal/*` (and wagers `/admin/*`) are guarded by the `X-Internal-Token`
  header (`app/utils/guards.py::internal_only`) and are **deliberately not routed
  by the gateway**. The `scheduler` reaches them over the compose network.
- Login is currently **OTP-only with no SMS provider** — `AUTH_REVEAL_OTP=true`
  returns the OTP in the API response. There is no real phone verification while
  this flag is on.

### Scheduler

`scheduler/scheduler.py` is a DB-less poll loop that `POST`s `/internal/tick` to
`contests`, `leagues`, and `ingestor` every `SCHEDULER_INTERVAL_SECONDS` (30).
Each service owns the work done on tick (settling wagers, advancing pick'em
periods, ingesting schedules). Add periodic work by implementing a service's
own `/internal/tick`, not by adding logic to the scheduler.

### Gateway

`api/gateway/conf.d/default.conf` is nginx: TLS terminator + `/api/*` router +
certbot renewal. It **strips the `/api` prefix** and proxies to the service's
`/v1/...` path (literal `proxy_pass` URI substitution — do not switch to
`rewrite ... break` with captures, it 500s). Everything not under `/api/` goes
to `webui:3000`. When you add/rename a backend route group, update this file.

## webui (Next.js)

Next.js 16 App Router, React 19, Tailwind 4, TanStack Query, based on the
Metronic template (`webui/README.md` is the stock template readme — ignore its
Prisma instructions; this app has no Prisma).

- `app/(app)` (auth-gated), `app/(guest)` (login/signup), `app/(public)`
  (shareable deep links) route groups.
- `proxy.ts` is the Next middleware: gates routes by presence of the
  `waygerz_access` cookie (public / guest-only / auth-required prefixes).
- `lib/` holds one data-client module per backend service (`leagues.ts`,
  `wagers.ts`, `wallet.ts`, …). `lib/api-paths.ts` mirrors each backend's
  `api_prefix()` — **keep it in sync with the services**. `lib/http.ts`
  (`apiFetch` / `apiJson`) is the shared fetch wrapper (sends cookies via
  `credentials: 'include'`).
- **API base URL:** `NEXT_PUBLIC_API_URL` is baked at build (`/api` behind the
  nginx gateway; `""` for the ALB so the browser hits `/v1/...` directly). SSR
  calls use `API_INTERNAL_URL` (`http://gateway`) over the compose network.

## Commands

### Whole stack (from `api/`)

```bash
docker compose up -d --build          # build + run everything
docker compose build webui gateway    # rebuild specific services
docker compose logs -f leagues        # tail a service
```

### Backend service tests (pytest)

Tests run against a **`*_test` schema** and require a running Postgres + Redis.
`conftest.py` asserts `DB_SCHEMA` ends with `_test` and creates/drops the schema
per session. From inside a service dir:

```bash
cd api/auth
DB_SCHEMA=auth_test pytest                       # all tests for this service
DB_SCHEMA=auth_test pytest tests/test_phone.py   # one file
DB_SCHEMA=auth_test pytest -k otp_verify         # one test by name
```

(Point `DATABASE_URL` / `REDIS_URL` at reachable instances if not on the compose
network.)

### Migrations (Flask-Migrate / Alembic, per service)

```bash
cd api/<service>
export FLASK_APP=wsgi.py
flask db migrate -m "describe change"   # autogenerate a revision
flask db upgrade                        # apply
flask init-schema                       # custom cmd: CREATE SCHEMA IF NOT EXISTS
```

`auth` also has `flask create-user <phone> <pin> --name <name>` (bypasses OTP).

### webui

```bash
cd webui
npm install --force    # React 19 peer-dep conflicts require --force
npm run dev            # dev server
npm run build          # production build
npm run lint           # eslint
npm run format         # prettier --write
```

## AWS environment (this host)

The dev host has the AWS CLI configured and working:

- **Profile:** `waygerz` (active via `AWS_PROFILE`), **region** `us-east-1`.
- **Identity:** IAM user `waygerz_aws`, account `882781856019`
  (`arn:aws:iam::882781856019:user/waygerz_aws`).
- Credentials live in `~/.aws/credentials` (not in this repo — never commit key
  material). Verify with `aws sts get-caller-identity`.
- This is a plain IAM user, **not** an EC2 instance role (IMDS has no role), and
  it is separate from CI: the deploy pipeline authenticates via GitHub OIDC.

## Deploy

CI is `.github/workflows/build-and-deploy.yml` — **manual `workflow_dispatch`**
(no auto-deploy on push). Pick a service (or `all`), it builds arm64, pushes to
ECR `waygerz/<service>`, optionally registers a new task def from
`<service>/taskdef.json` and rolls the ECS service. webui builds from
`webui/docker/Dockerfile` with `NEXT_PUBLIC_API_URL=` (empty, ALB mode).
