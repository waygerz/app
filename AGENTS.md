# waygerz — All Application Services

The repo splits three ways: **`api/`** (backend Flask services + scheduler +
gateway), **`web/`** (the Next.js SSR app), and **`mobile/`** (Flutter — iOS +
Android). Compose is driven from **`api/`**, not the repo root.

## Backend (Flask)

Each service is the same shape (routes/controllers/services/models/utils) and
owns one Postgres schema. `api/auth/` is the reference template. All services
share one database; isolation is by schema — never cross-query another service's
schema, go through its API.

| Service | Path | Schema |
|---------|------|--------|
| `auth` | `api/auth/` | `auth` |
| `users` | `api/users/` | `users` |
| `friends` | `api/friends/` | `friends` |
| `comments` | `api/comments/` | `comments` |
| `messaging` | `api/messaging/` | `messaging` |
| `ingestor` | `api/ingestor/` | `ingestor` |
| `wallet` | `api/wallet/` | `wallet` |
| `contests` | `api/contests/` | `contests` |
| `leagues` | `api/leagues/` | `leagues` |
| `media` | `api/media/` | `media` |
| `notifications` | `api/notifications/` | `notifications` |

`auth` mints the JWT; every service verifies it locally with the shared
`JWT_SECRET_KEY`. `users` was split out of `auth` (profiles moved to the `users`
schema; `auth` keeps credentials and dual-writes at signup).

## Scheduler & edge

| Service | Path | Notes |
|---------|------|-------|
| `scheduler` | `api/scheduler/` | Poll loop; `POST /internal/tick` on contests, leagues, ingestor (no DB) |
| `webui` | `web/` | Next.js 16 SSR app on `:3000` (App Router, React 19); compose context `../web` |
| `gateway` | `api/gateway/` | nginx TLS + `/api` router + certbot renew; certs in `api/gateway/certbot/` |

`pgsql` and `redis` are image-only services (no source folder).

## Compose & env

`docker-compose.yml` and `.env` live in **`api/`**; run all `docker compose`
commands from there. Backend build contexts are relative to it (`./auth`,
`./gateway`, …); webui is the exception — its context is `../web`.

```bash
cd api
docker compose up -d --build      # build + run everything
docker compose build webui gateway
```

## Deploy

CI is `.github/workflows/build-and-deploy.yml` — a manual `workflow_dispatch`
that builds a service (or `all`) for `linux/arm64`, pushes to ECR
`waygerz/<service>`, and optionally rolls the ECS service. ECR/ECS names stay
unversioned (`waygerz/<service>`, service `<service>`), independent of the
`/v1/{group}/{service}` API path prefix.

Internal (east-west) service calls use **ECS Service Connect** mesh names
(`http://<service>:8000`, namespace `waygerz`) — never the public
`https://waygerz.com` ALB, whose private-zone IPs drift on ALB rotation. New
services must join the mesh. Mobile/web (north-south) clients are unaffected.

See `CLAUDE.md` for the full architecture (JWT auth model, schema isolation, API
prefix contract, gateway routing, internal-token guards, Service Connect).
