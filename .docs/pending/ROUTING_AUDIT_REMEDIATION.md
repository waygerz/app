# Routing audit — remediation (2026-08-27)

Findings from the three-part routing audit (ALB/infra, repo consistency, internal
call-graph) and what's fixed vs still owed. **Code fixes are committed; AWS-side
items are classifier-blocked and run from CloudShell** (script:
`.scripts/routing-remediation.sh`). Order matters — deploy the code first.

## Status table

| # | Finding | Sev | Where | Status |
|---|---|---|---|---|
| 1a | webui SSR `API_INTERNAL_URL=https://waygerz.com` → drifted private zone | HIGH | AWS/SSM | **TODO** (§1) |
| 1b | `notifications INTERNAL_AUTH_URL`=ALB, live-used on SMS phone lookup | HIGH | AWS env | **TODO** (§2) — code default already mesh |
| 2 | No redundancy — every service `desiredCount=1` | HIGH | AWS | **TODO** (§4) |
| 3 | No cluster headroom (~3–4× short for concurrent rolls) | HIGH | AWS | **TODO** (§4) |
| 4 | `/internal` + `/admin` internet-reachable (prefix match), token-only | MED | code+AWS | **code fixed** (nginx regex 404) + ALB rule TODO (§3) |
| 5 | `INTERNAL_*_URL` defaults missing `/v1/{group}/{svc}` → dev 404 | MED | code | **FIXED** (contests/comments/friends/leagues/messaging) |
| 6 | `media`/`webui` not in mesh; `comments` client-only | MED | AWS | **TODO** (§5) |
| 7 | No `api.waygerz.com`; cert only covers apex/www | MED | AWS/ACM | **TODO** (§6) — pre-mobile-launch |
| 8 | `webui-tg` deregistration delay 300s | MED | AWS | **TODO** (§3) |
| 9 | ~vestigial internal-URL env entries (incl. ALB on wallet/media/ingestor) | LOW | AWS | **TODO** (§2) |
| 10 | `users-tg` health check diverges (30/5/2 vs 15/2/3) | LOW | AWS | **TODO** (§3) |
| 11 | dead `AUTH_URL` config keys | LOW | code | **FIXED** (removed from 5 configs) |
| 12 | no in-repo backend taskdefs (no guardrail) | LOW | process | note only |
| 13 | gateway trailing-slash inconsistency (compose-only) | LOW | code | note only |

Positives confirmed (no action): all 11 groups have ALB rules → service TGs
directly (no gateway hop in prod), real `/health` checks, HTTP→HTTPS 301, SG
self-reference rule present, mobile path/host parity is fine.

---

## §1 — webui SSR off the drifted `waygerz.com` (HIGH)

webui SSR uses SSM `/waygerz/ui/API_INTERNAL_URL = https://waygerz.com`, which
in-VPC resolves via the drifted private zone. Two options:
- **Short-term:** re-pin the private zone (restores SSR + any residual ALB path):
  ```bash
  aws route53 change-resource-record-sets --hosted-zone-id Z01771832FTXE4Q0ZGFLB \
    --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"waygerz.com.","Type":"A","TTL":60,"ResourceRecords":[{"Value":"10.0.2.79"},{"Value":"10.0.1.37"}]}}]}'
  ```
- **Durable:** bring webui into Service Connect as a client (§5), then point
  `API_INTERNAL_URL` at a mesh target. webui SSR currently expects a single
  gateway-style base; simplest is to keep an in-mesh gateway/router, or repoint
  SSR to call services by mesh name. Until webui is meshed, keep the re-pin.

## §2 — internal-URL env cleanup (HIGH for notifications, LOW for the rest)

Prereq: deploy the corrected code first (mesh `/v1` defaults), THEN drop overrides.
- **notifications `INTERNAL_AUTH_URL` (live bug):** its code default is already
  `http://auth:8000/v1/platform/auth`; just drop the ALB override and roll. The
  script does this first (it's the one actually-exercised ALB caller).
- **Vestigial ALB/mesh overrides** on wallet, media, ingestor, auth, friends,
  notifications, contests, comments, messaging, leagues: drop every
  `INTERNAL_*_URL` so the (now-correct) mesh defaults apply. Safe only after the
  code deploy. Never touch non-peer envs (REDIS_URL, DATABASE_URL, CORS_*, etc.).

## §3 — ALB hardening + target-group hygiene (MED/LOW)

- **Deny `/internal` + `/admin` at the ALB** (prod has no gateway; the nginx 404
  only covers compose). Add a top-priority fixed-response 404 rule.
- **`webui-tg` dereg delay** 300s → 30s.
- **`users-tg` health check** → align to fleet (interval 15, healthy 2, unhealthy 3).

## §4 — redundancy + capacity (HIGH, needs a decision)

Every service is `desiredCount=1` (SPOF) and the 3-instance cluster can't host
`desiredCount=2` (largest free block ~774MB; Envoy sidecars ~+320MB/task). Plan:
1. Add a 4th container instance (or right-size the 3 up) for ≥2 full surge slots/AZ.
2. Then `desiredCount=2` across AZs for the critical set: auth, users, webui,
   leagues, contests, wallet. (Judgment/cost call — not scripted.)

## §5 — finish the mesh: webui + media (+ comments ingress) (MED)

- Enable Service Connect **client** on webui (so SSR can use mesh names, §1).
- Enable Service Connect **server** on media (named `http` port + serviceConnect
  config) for uniformity — nothing calls it today, but the moment something does
  it must resolve in-mesh, not fall back to `waygerz.com`.
- `comments` is client-only and correct unless something needs to call it inbound.
- Pattern is identical to the users migration — see
  `.docs/complete/INTERNAL_SERVICE_CONNECT.md` §1 (remember the +Envoy memory bump).

## §6 — `api.waygerz.com` before the Flutter app ships (MED, pre-launch)

Native clients hard-code the base URL into app-store binaries, so decouple the API
host BEFORE launch:
1. Add `api.waygerz.com` as an ACM SAN on the ALB cert (or a new cert) — the
   current cert only covers `waygerz.com`/`www`, so a DNS record alone is not
   enough.
2. Public-zone A-alias `api.waygerz.com` → the ALB.
3. Bake `https://api.waygerz.com` as the mobile base URL from day one.
This isolates mobile from web/marketing/email DNS churn (and the drift saga).

## §7 — process guardrail (LOW)

Backend taskdefs live only in AWS (repo has just `web/taskdef.json`), so the
`/v1`-suffix fix (§5 code) has no CI guard. Consider committing taskdefs (or a
generator) and/or a startup assert that every `INTERNAL_*_URL` contains `/v1/`.
