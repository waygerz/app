# app — All Application Services

Every Docker-built service lives under `app/<name>/`. Compose **service names** are unchanged (`auth`, `webui`, `gateway`, …); only build contexts and volume paths moved here.

## Backend (Flask)

| Service | Path | Schema |
|---------|------|--------|
| `auth` | `app/auth/` | `auth` |
| `friends` | `app/friends/` | `friends` |
| `comments` | `app/comments/` | `comments` |
| `messaging` | `app/messaging/` | `messaging` |
| `ingestor` | `app/ingestor/` | `ingestor` |
| `wallet` | `app/wallet/` | `wallet` |
| `contests` | `app/contests/` | `contests` |
| `leagues` | `app/leagues/` | `leagues` |
| `notifications` | `app/notifications/` | `notifications` |
| `media` | `app/media/` | `media` |

Template: `app/auth/` (routes/controllers/services layout).

## Scheduler & edge

| Service | Path | Notes |
|---------|------|-------|
| `scheduler` | `app/scheduler/` | Poll loop; `POST /internal/tick` on contests + leagues (no DB) |
| `webui` | `app/webui/` | React + Vite SPA; see `app/webui/AGENTS.md` |
| `gateway` | `app/gateway/` | nginx TLS + `/api` router + certbot renew; certs in `app/gateway/certbot/` |

## Compose & env

`docker-compose.yml` and `.env` live in this directory. All `docker compose` commands run from `app/`.

`pgsql` and `redis` are image-only services (no source folder).

```bash
# Deploy scripts cd to app/ automatically
bash _scripts/deploy.sh

# Manual compose (from app/)
docker compose build webui gateway
```
