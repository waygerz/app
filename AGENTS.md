# waygerz — All Application Services

Every Docker-built service lives at the **repo root** in its own directory
(`auth/`, `web/`, `gateway/`, …). Compose is driven from the repo root.

## Backend (Flask)

Each service is the same shape (routes/controllers/services/models/utils) and
owns one Postgres schema. `auth/` is the reference template.

| Service | Path | Schema |
|---------|------|--------|
| `auth` | `auth/` | `auth` |
| `friends` | `friends/` | `friends` |
| `comments` | `comments/` | `comments` |
| `messaging` | `messaging/` | `messaging` |
| `ingestor` | `ingestor/` | `ingestor` |
| `wallet` | `wallet/` | `wallet` |
| `contests` | `contests/` | `contests` |
| `leagues` | `leagues/` | `leagues` |
| `notifications` | `notifications/` | `notifications` |
| `media` | `media/` | `media` |

## Scheduler & edge

| Service | Path | Notes |
|---------|------|-------|
| `scheduler` | `scheduler/` | Poll loop; `POST /internal/tick` on contests, leagues, ingestor (no DB) |
| `webui` | `web/` | Next.js SSR app on `:3000` (App Router, React 19) |
| `gateway` | `gateway/` | nginx TLS + `/api` router + certbot renew; certs in `gateway/certbot/` |

`pgsql` and `redis` are image-only services (no source folder).

## Compose & env

`docker-compose.yml` and `.env` live at the repo root; run all `docker compose`
commands from there.

```bash
docker compose up -d --build      # build + run everything
docker compose build webui gateway
```

## Deploy

CI is `.github/workflows/build-and-deploy.yml` — a manual `workflow_dispatch`
that builds a service (or `all`) for `linux/arm64`, pushes to ECR
`waygerz/<service>`, and optionally rolls the ECS service.

See `CLAUDE.md` for the full architecture (JWT auth model, schema isolation, API
prefix contract, gateway routing).
