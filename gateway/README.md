# gateway

nginx + TLS in front of every waygerz service. The whole public surface is one
domain — **https://waygerz.com**:

- `/api/<service>/*` → the matching backend container on `:8000`, with the
  `/api` prefix stripped (e.g. `/api/auth/login` → `auth:8000/auth/login`).
- everything else → the WebUI (production static build).

Service map (`conf.d/default.conf`) — versioned public API:

| Public path                    | Upstream                              |
|--------------------------------|---------------------------------------|
| `/api/v1/platform/auth/*`          | `auth:8000/v1/platform/auth/*`            |
| `/api/v1/social/friends*`        | `friends:8000/v1/social/friends*`       |
| `/api/v1/gameplay/wallet/*`    | `wallet:8000/v1/gameplay/wallet/*`    |
| `/api/v1/gameplay/leagues*`    | `leagues:8000/v1/gameplay/leagues*`   |
| `/api/v1/gameplay/contests*`   | `contests:8000/v1/gameplay/contests*` |
| `/api/v1/platform/ingestor*`      | `ingestor:8000/v1/platform/ingestor*`     |
| `/api/v1/social/messaging/*` | `messaging:8000/v1/social/messaging/*` (SSE) |
| `/*`                           | `webui:80` (static SPA)               |

Auth is a **JWT minted by `auth` and verified locally by each service**, so the
gateway has no session/auth_request logic — it just forwards `Authorization`.
Service-to-service `/internal/*` endpoints and wagers `/admin/*` are deliberately
**not** routed, so they stay private to the compose network.

## TLS (Let's Encrypt)

Certs are issued on first boot (`init-letsencrypt.sh`) and auto-renewed inside
the gateway container (`certbot renew` every 12h, then `nginx -s reload`). Cert
files bind-mount at `/etc/letsencrypt`; the ACME http-01 webroot is
`/var/www/certbot` over plain HTTP.

**First deploy** (run once on the server, from the repo root):

```bash
GATEWAY_DOMAIN=waygerz.com LETSENCRYPT_EMAIL=anky@sanixay.com \
  ./_scripts/init-letsencrypt.sh
```

It mints a throwaway self-signed cert, starts the stack, then swaps in the real
cert and reloads nginx. Test against LE staging first with `LETSENCRYPT_STAGING=1`
to avoid burning the production rate limit.

After bootstrap, normal deploys are just:

```bash
./_scripts/deploy.sh        # build + up + schemas/migrations (idempotent)
```

Renewal is automatic: the gateway entrypoint runs `certbot renew` every 12h
and reloads nginx afterward.

## Prerequisites

- DNS `A` record for `waygerz.com` → the server's public IP.
- Inbound `80` and `443` open in the EC2 security group (80 is required for the
  ACME challenge and the HTTP→HTTPS redirect).
