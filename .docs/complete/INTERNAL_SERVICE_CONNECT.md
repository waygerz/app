# Internal service networking — Service Connect (east-west)

**Status:** `users` migrated onto the mesh (2026-08-27). This closes out the
recurring "internal calls to `waygerz.com` time out" failure.

## The problem it fixes

East-west (service→service) calls must use **ECS Service Connect** mesh names —
`http://<service>:8000/...`, Cloud Map namespace **`waygerz`**. Seven services
already did; **`users`** (split out 2026-08-15) never joined the mesh, so its
callers were pointed at the public ALB via `INTERNAL_USERS_URL=https://waygerz.com/...`.

That public name is resolved **inside the VPC** by a **private hosted zone**
(`Z01771832FTXE4Q0ZGFLB`, `waygerz.com.`) whose **A record pins the ALB's private
IPs**. The ALB has one node per AZ; when nodes rotate, their private IPs change,
the pinned record goes stale, and every internal call to `waygerz.com` hits a dead
IP → `ConnectTimeout` (10s). On 2026-08-27 the record still held `10.0.2.81 /
10.0.1.171` while the ALB had moved to `10.0.2.79 / 10.0.1.37`, which 500'd every
league-detail load (leagues → users `/internal/profiles`).

**North-south clients are unaffected.** The web browser and the **Flutter mobile
apps** reach the API through the **public** hosted zone's ALB record
(`https://waygerz.com/v1/...`); they never resolve or touch the mesh. Deleting the
*private* override does not change public resolution.

## Current facts (2026-08-27)

- ALB: `waygerz-alb` (internet-facing, single ALB, 2 AZ nodes). Current private
  IPs: `10.0.2.79` (1b), `10.0.1.37` (1a).
- Cloud Map namespace: `waygerz` (`ns-5foziozh7ezlljyq`, HTTP).
- Private hosted zone with the pinned override: `Z01771832FTXE4Q0ZGFLB`.
- `users` task def (`waygerz-users:1`) already has a **named port** (`http`,
  container port 8000) → mesh-ready. BUT its task memory is **256 MB** (leagues,
  which runs the Envoy sidecar, is 320) — adding the sidecar at 256 will **OOM**,
  so Step 1 registers a new revision at **320** first.
- `users` itself also calls notifications over the ALB
  (`INTERNAL_NOTIFICATIONS_URL=https://waygerz.com/...`) — repoint that in the
  same new revision.
- Callers that carried `INTERNAL_USERS_URL`/`USERS_URL = https://waygerz.com/...`:
  **auth, comments, contests, friends, leagues, messaging, scheduler** (7).
- Code default in every service is already `http://users:8000/v1/platform/users`,
  so the fix is: put users on the mesh, then **drop the env override**.

All commands below are **AWS writes** — run them in CloudShell (the dev host's IAM
user is blocked from ECS/Route53 writes by the classifier).

## Immediate band-aid (only if you need it up before the real fix)

Re-pin the private record to the ALB's current IPs (60s TTL):

```bash
aws route53 change-resource-record-sets --hosted-zone-id Z01771832FTXE4Q0ZGFLB \
  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"waygerz.com.","Type":"A","TTL":60,"ResourceRecords":[{"Value":"10.0.2.79"},{"Value":"10.0.1.37"}]}}]}'
```

## Permanent fix

### Step 1 — put `users` on the mesh

First register a new users revision that bumps memory (256→320 for the Envoy
sidecar) and repoints its own notifications URL onto the mesh:

```bash
UTD=$(aws ecs describe-services --cluster waygerz-prod --services users \
       --query 'services[0].taskDefinition' --output text)
aws ecs describe-task-definition --task-definition "$UTD" \
  --query 'taskDefinition' --output json > /tmp/users.json
jq '.memory="320"
    | .containerDefinitions[0].environment |=
        ( map(select(.name!="INTERNAL_NOTIFICATIONS_URL"))
          + [{"name":"INTERNAL_NOTIFICATIONS_URL",
              "value":"http://notifications:8000/v1/platform/notifications"}] )
    | del(.taskDefinitionArn,.revision,.status,.requiresAttributes,
          .compatibilities,.registeredAt,.registeredBy)' \
   /tmp/users.json > /tmp/users.new.json
UNEW=$(aws ecs register-task-definition --cli-input-json file:///tmp/users.new.json \
        --query 'taskDefinition.taskDefinitionArn' --output text)
```

Then roll users onto that revision with Service Connect enabled:

```bash
aws ecs update-service --cluster waygerz-prod --service users \
  --task-definition "$UNEW" --force-new-deployment \
  --service-connect-configuration '{
    "enabled": true,
    "namespace": "waygerz",
    "services": [{
      "portName": "http",
      "discoveryName": "users",
      "clientAliases": [{"port": 8000, "dnsName": "users"}],
      "timeout": {"perRequestTimeoutSeconds": 120}
    }],
    "logConfiguration": {"logDriver":"awslogs","options":{
      "awslogs-group":"/ecs/waygerz/service-connect",
      "awslogs-region":"us-east-1","awslogs-stream-prefix":"envoy"}}
  }'

aws ecs wait services-stable --cluster waygerz-prod --services users
```

Now `users:8000` resolves in-mesh (Envoy sidecar injected). Confirm the sidecar is
`RUNNING`+`HEALTHY` and the app container isn't OOM-killed before Step 2.

### Step 2 — repoint the callers (drop the ALB override, roll)

Removes the `INTERNAL_USERS_URL` / `USERS_URL` env from each task def so the
correct code default (`http://users:8000/...`) applies, then rolls the service.

```bash
for SVC in auth comments contests friends leagues messaging scheduler; do
  echo "=== $SVC ==="
  TD=$(aws ecs describe-services --cluster waygerz-prod --services "$SVC" \
        --query 'services[0].taskDefinition' --output text)
  aws ecs describe-task-definition --task-definition "$TD" \
    --query 'taskDefinition' --output json > /tmp/$SVC.json
  # strip the ALB users URLs + non-registerable fields
  jq '.containerDefinitions[0].environment |=
        map(select(.name!="INTERNAL_USERS_URL" and .name!="USERS_URL"))
      | del(.taskDefinitionArn,.revision,.status,.requiresAttributes,
            .compatibilities,.registeredAt,.registeredBy)' \
     /tmp/$SVC.json > /tmp/$SVC.new.json
  NEW=$(aws ecs register-task-definition --cli-input-json file:///tmp/$SVC.new.json \
         --query 'taskDefinition.taskDefinitionArn' --output text)
  aws ecs update-service --cluster waygerz-prod --service "$SVC" \
    --task-definition "$NEW" --force-new-deployment >/dev/null
  echo "rolled $SVC -> $NEW"
done
```

> If you'd rather keep the var explicit than rely on the default, replace the
> `map(select(...))` filter with one that sets the value to
> `http://users:8000/v1/platform/users` instead of dropping it.

### Step 3 — verify

```bash
# no service should still carry the ALB users URL:
for SVC in auth comments contests friends leagues messaging scheduler; do
  TD=$(aws ecs describe-services --cluster waygerz-prod --services "$SVC" --query 'services[0].taskDefinition' --output text)
  echo "$SVC $(aws ecs describe-task-definition --task-definition "$TD" \
    --query "taskDefinition.containerDefinitions[0].environment[?name=='INTERNAL_USERS_URL'||name=='USERS_URL'].value|[0]" --output text)"
done
# functional: open a league detail in the app; leagues logs should be clean of
# 'ConnectTimeout ... /internal/profiles'.
```

### Step 4 — retire the drift mechanism (NOT yet — precondition below)

> **2026-08-27 finding — do not delete the zone yet.** A fleet-wide sweep after
> the `users` migration found **residual `INTERNAL_*_URL=https://waygerz.com`** on
> **auth, friends, ingestor, wallet, media, notifications** (e.g. auth's
> `INTERNAL_LEAGUES_URL`/`WALLET`/`CONTESTS`/`INGESTOR`/`FRIENDS`). They log **zero**
> `ConnectTimeout` even though the pinned record is currently stale, so they read
> as **vestigial/unused** — but that's not proof a rarely-fired path (media, a
> specific notification) never uses one. **Precondition for deletion:** repoint (or
> remove) those residual URLs to mesh names across all six services first, then
> re-run the fleet sweep until it's clean:
> ```bash
> for s in auth users friends comments messaging ingestor wallet contests leagues media notifications scheduler webui; do
>   TD=$(aws ecs describe-services --cluster waygerz-prod --services "$s" --query 'services[0].taskDefinition' --output text)
>   H=$(aws ecs describe-task-definition --task-definition "$TD" --query "taskDefinition.containerDefinitions[0].environment[?starts_with(name,'INTERNAL_') && contains(value,'waygerz.com')].name" --output text)
>   [ -n "$H" ] && echo "$s: $H"
> done   # <- must print nothing
> ```
> (CORS_ALLOWED_ORIGINS / AUTH_COOKIE_DOMAIN keep `waygerz.com` — those are correct
> and unrelated.) The Step-2 jq (drop `INTERNAL_*_URL` so the mesh default applies)
> is the pattern to reuse for the sweep. Until then, **leave the private zone as
> is** — it's harmless because nothing resolves it.

Once that sweep is clean, delete the private override so there's no pinned record
left to drift. Get the exact current record first, then delete it verbatim:

```bash
aws route53 list-resource-record-sets --hosted-zone-id Z01771832FTXE4Q0ZGFLB \
  --query "ResourceRecordSets[?Name=='waygerz.com.'&&Type=='A']"
# then DELETE that exact record set (same Name/Type/TTL/values) via change-batch.
```

Leave `pgsql.waygerz.internal` / `redis.waygerz.internal` alone — static datastore
endpoints, not part of this. **Do not** touch the *public* zone
(`Z01835431RPO0KGK46JBE`) — that's what mobile/web use.

## Guardrail (stop the recurrence)

- Code defaults already point at the mesh; **prod leaves `INTERNAL_*_URL` unset.**
- A new service must (a) name its container port (`http`) and (b) get a
  `serviceConnectConfiguration` (Step 1 shape) before any caller references it.
- Never set an `INTERNAL_*_URL` to `https://waygerz.com`. CLAUDE.md and AGENTS.md
  now say this; the old "must set the ALB form" comments were removed from every
  `config.py` on 2026-08-27.
