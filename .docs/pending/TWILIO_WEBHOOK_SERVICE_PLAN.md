# Plan: `twilio` webhook service — call + text fan-out line

Status: **proposed (audit-converged, rev 7)** · Owner: backend · Related:
[`sms-twilio-config`], [`legal-and-signup-consent`], `INTERNAL_SERVICE_CONNECT.md`

## Goal

Stand up a new backend container, **`api/twilio/`**, that owns the inbound
webhooks Twilio calls for our number, and turns that number into a **shared team
line**:

- `POST …/voice` — an incoming **call rings a list of real phones
  simultaneously**; first *human* to answer is bridged (voicemail is screened
  out). No-answer falls through to a spoken fallback.
- `POST …/sms` — an incoming **text is forwarded (a copy) to every phone** in the
  same list, so the whole team sees it.

The destination list (`FORWARD_TO`) is **config, not code** — see
"Configuration". Twilio-**outbound** account texts (OTP, notifications) stay in
the `notifications` service; this service is the **inbound + forwarding** edge.

## Why this service is shaped unlike the others

Every other Flask service is called by our own clients (web/mobile, JWT) or
east-west over the mesh (`X-Internal-Token`). **This one is called by Twilio's
servers over the public internet**, so three conventions invert:

1. **Auth is a Twilio signature, not a JWT.** Webhook routes are *public* (no
   `waygerz_access`, no `Authorization`). Each request is authenticated by
   validating `X-Twilio-Signature` (HMAC of URL + POST params) with
   `TWILIO_AUTH_TOKEN`. Forged posts → `403`.
2. **Responses are TwiML (XML), not JSON** — built with `twilio.twiml.*`, returned
   as `Content-Type: text/xml`.
3. **Prefixes stay standard** (`/v1/platform/twilio/**`) so the ALB `/v1/*`
   routing applies unchanged. Twilio's console gets the full URLs
   `https://waygerz.com/v1/platform/twilio/voice` and `.../sms`. (This service has
   **no** `/internal` routes, so the edge `/internal|/admin` deny is irrelevant
   here.)

## Signature validation (two hard footguns)

**Footgun 1 — behind the proxy.** Twilio signs the **exact public URL it called**
(`https://waygerz.com/v1/platform/twilio/voice`), but behind the ALB Flask sees
`http://…:8000/v1/platform/twilio/voice` — different scheme/host, no `/api`.
Validating against `request.url` makes **every real webhook fail**. Fix:
- Configure `TWILIO_WEBHOOK_BASE_URL=https://waygerz.com/v1/platform/twilio` and
  validate against `base + request.path`'s **matched route suffix** — computed
  from the actual matched route, **not** a hardcoded `/voice`, so `/voice/after`
  and `/voice/screen` callbacks validate correctly too.
- Validate over the raw `request.form` (what Twilio signed). Any proxy in front
  must preserve the `X-Twilio-Signature` header and the urlencoded body — the prod
  ALB does; the dev gateway `location` must not strip them.
- `TWILIO_VALIDATE_SIGNATURE` **defaults `true` in code**; only
  `docker-compose.yml` sets it `false` for local dev. Prod never inherits a false.
- **Fail fast on a missing base.** `TWILIO_WEBHOOK_BASE_URL` has no safe default —
  if unset, every callback URL becomes `None/voice/…` and both callbacks and
  validation break silently. `create_app()` asserts it is set (and https) at boot
  when `TWILIO_VALIDATE_SIGNATURE` is true, so the container refuses to start
  misconfigured rather than 403-ing every request.
- **Console URL must match exactly.** The webhook URLs entered in the Twilio
  console must equal `TWILIO_WEBHOOK_BASE_URL + <route>` **character-for-character**
  (scheme, host, no trailing slash) — Twilio signs the string it calls, so any
  divergence (http vs https, an ALB DNS host, a stray `/`) fails validation.

**Footgun 2 — the health check must bypass the guard.** The ALB target-group
health check hits `/v1/platform/twilio/health` with **no signature**. If the
guard runs blueprint-wide, health checks `403` → target stays **unhealthy** →
ECS never registers it → silent outage. **The signature guard is applied per
webhook route — `/sms`, `/voice`, `/voice/after`, and `/voice/screen` (which
Twilio POSTs to twice: once as the whisper, once as its own `action` verify with
`Digits`) — only; `/health` is always open.** (Do not use a blanket
`before_request`.)

## `/voice` — simulring fan-out with voicemail screening

Ring every number in `FORWARD_TO` at once, but **screen each leg** so a phone's
voicemail can't silently swallow the call: each `<Number>` carries a `url` to a
short "press 1 to accept" whisper. Voicemail can't press a key, so only a live
human is bridged. On no-answer, speak a fallback instead of dropping silently.

```python
from flask import Response, request
from twilio.twiml.voice_response import VoiceResponse, Dial, Gather

# All callback URLs MUST be fully qualified from the configured public base.
# A bare "/voice/after" is a path-absolute reference: Twilio (RFC 3986) resolves
# it against scheme+host only, dropping the /v1/platform/twilio prefix, so the
# callback would hit the webui default target instead of this service. Building
# from BASE also makes the callback URL identical to what the signature validator
# reconstructs — one source of truth.
BASE = Config.TWILIO_WEBHOOK_BASE_URL      # e.g. https://waygerz.com/v1/platform/twilio

@app.post("/voice")                # signature-guarded
def incoming_voice():
    resp = VoiceResponse()
    dial = Dial(timeout=20, answer_on_bridge=True, action=f"{BASE}/voice/after",
                caller_id=TWILIO_FROM)     # show the main Waygerz number
    for number in FORWARD_TO:              # from config/SSM; excludes TWILIO_FROM
        if VOICE_SCREEN:                   # branch explicitly; never pass url=None
            dial.number(number, url=f"{BASE}/voice/screen")
        else:
            dial.number(number)
    resp.append(dial)
    return Response(str(resp), mimetype="text/xml")

@app.post("/voice/screen")         # signature-guarded; runs on the *answering* leg.
def voice_screen():                # self-referential: Gather action loops back here.
    resp = VoiceResponse()
    digits = request.form.get("Digits")
    if digits == "1":              # accepted -> empty TwiML completes -> BRIDGE
        return Response("<Response/>", mimetype="text/xml")
    if digits:                     # wrong key -> drop this leg
        resp.hangup()
        return Response(str(resp), mimetype="text/xml")
    g = Gather(num_digits=1, timeout=5, action=f"{BASE}/voice/screen", method="POST")
    g.say("Waygerz call. Press 1 to accept.")
    resp.append(g)
    resp.hangup()                  # no input (voicemail) -> drop this leg
    return Response(str(resp), mimetype="text/xml")

@app.post("/voice/after")          # signature-guarded
def voice_after():
    resp = VoiceResponse()
    status = request.form.get("DialCallStatus")
    # "completed" alone is NOT proof a human talked: a leg that answered and was
    # then hung up by screening also reports completed. Require a real bridge —
    # a non-trivial DialCallDuration — before assuming someone was reached.
    try:
        bridged_secs = int(request.form.get("DialCallDuration") or 0)
    except ValueError:
        bridged_secs = 0
    if status != "completed" or bridged_secs < 2:   # nobody actually connected
        resp.say("Sorry, no one is available right now. Please text us instead.")
    resp.hangup()
    return Response(str(resp), mimetype="text/xml")
```

- **Callback URLs are fully qualified** (`f"{BASE}/voice/…"`), never bare
  `/voice/…` — a leading-slash path drops the `/v1/platform/twilio` prefix on
  Twilio's side and the callback would 404 into the webui. This is the single
  easiest way to ship voice broken; keep every `action`/`url` built from `BASE`.
- **Voicemail screening (`/voice/screen`)** is the fix for the #1 simulring trap:
  without it the first cell whose voicemail picks up (1–2 rings) bridges the
  caller to voicemail and cancels everyone else. Requiring a keypress excludes
  machines. The route is **self-referential**: the `<Gather>` (with its
  fully-qualified `action=f"{BASE}/voice/screen"`) re-POSTs here *with* `Digits`
  when a key is pressed — `1` returns an empty
  `<Response/>` (which completes the leg's TwiML without a hangup, so it bridges);
  any other key or a no-input timeout hangs up that leg only, leaving the others
  ringing until `timeout`. Returning `<Hangup/>` on accept — or a bare `<Gather>`
  with no `action` — would drop the accepting human, so the branch matters.
- **`VOICE_SCREEN` toggle**: screening forces every answerer to press 1 before
  they're connected — correct for a shared line, but some teams find it annoying.
  Gate it behind `VOICE_SCREEN` (default `true`) so it's off-able without a code
  change. With it off, `dial.number(number)` bridges the first pickup (voicemail
  race returns — an accepted tradeoff only if the team opts in).
- **`/voice/after` fallback**: keys off `DialCallStatus` **and** a real
  `DialCallDuration`, so an all-voicemail call (answered-then-screened, which can
  still report `completed`) correctly speaks the "no one available" fallback
  instead of leaving the caller in silence.
- `answer_on_bridge=True` → caller hears ringback, not silence; billing starts on
  bridge.
- **Caller ID**: `caller_id=TWILIO_FROM` — forwarded calls display the **main
  Waygerz number**, not the original caller (consistent branding, sidesteps
  carrier rejection of un-owned forwarded caller IDs). The real caller's number is
  still in the webhook `From` if we ever want to surface it (e.g. a follow-up text).
- Multiple screened `<Number>` in one `<Dial>` = **simultaneous** ring (the goal).
- **Cost note**: a screened leg that goes to voicemail still counts as an
  *answered* outbound call, billed for the few seconds until the whisper hangs it
  up. Expected and cheap, but not free — the trade for excluding voicemail.

## `/sms` — forward a copy to all (best-effort, bounded)

Each inbound text is re-sent from our Twilio number to every phone in
`FORWARD_TO`, prefixed with the original sender, then we return an empty
`<Response/>`.

```python
# per destination:  from_=TWILIO_FROM  to=<dest>  body="From +1XXXXXXXXXX: <text>"
```

- **Best-effort, never abort mid-fan-out.** Loop over destinations; a per-number
  send failure is logged and skipped (mirrors `_send_push` in `notifications`),
  so one bad number doesn't drop the rest.
- **Stay under Twilio's ~15s webhook deadline.** N sequential REST sends
  (~200–500ms each) can approach the limit. Mitigations, in order: cap
  `FORWARD_TO` length (documented limit, e.g. ≤10); return the empty `<Response/>`
  and perform the sends in a worker thread so the webhook ack is immediate. v1 may
  do synchronous-with-cap; note the async path as the scale valve.
- **Echo / group-chat decision (staff replies).** A forwarded text arrives at
  staff *From* `TWILIO_FROM`, so a staffer's reply re-enters `/sms` and would
  fan out to everyone. Chosen behavior: **treat `From ∈ FORWARD_TO` as a group
  message** — broadcast to the *other* members, skip the sender (so no self-echo).
  (Alternative — drop staff replies entirely — is noted but not chosen.) Requires
  the fan-out to exclude the sender, not just `TWILIO_FROM`.
- **Sender label needs roster labels.** Stateless, we only know the sender's
  *number*, so the prefix is `From <number>:` for everyone. To show a name
  (`From Sam:`) the roster entries carry an optional label —
  `{"number": "+1…", "name": "Sam"}` — looked up for both staff and known
  contacts; unknown numbers fall back to the raw number.
- **Amplification guard.** Each inbound = N outbound (billed). A per-sender rate
  limit / daily cap in **Redis** (already in the stack) prevents a spammer from
  multiplying spend N×. On a rate-limit hit, return an empty `<Response/>` and
  send nothing (no reply to the spammer, no fan-out).
- **The forward is an outbound send.** v1: the twilio service calls the Twilio
  REST API directly (it already holds `TWILIO_AUTH_TOKEN`; these are operational
  forwards to fixed numbers, not preference-gated notifications). Alternative
  (single outbound chokepoint): a raw `notifications /internal/sms/send` —
  **open decision #1**, plan assumes direct.
- **MMS**: inbound may carry media (`NumMedia > 0`); forwarding `MediaUrl` is
  deferred, but the forwarded text appends `[media omitted]` when `NumMedia > 0`
  so staff aren't misled into thinking a photo-only message was blank.
- **STOP/START/HELP**: handled by Twilio opt-out (see next section); the keyword
  is consumed by Twilio and never reaches `/sms`, so it never fans out to staff.

## Opt-out (STOP) — Twilio-owned, plus a precondition and a lockout guard

**Precondition (verify first).** Full **Advanced Opt-Out** (custom keywords/copy,
guaranteed keyword consumption) is a **Messaging Service** feature. Confirm
+18335885058 is attached to a **Messaging Service**; if it's a standalone number
it falls back to Twilio **default opt-out** (still automatic and still consumes
STOP, but not customizable). Adjust console step accordingly.

**Companion change in `notifications`: OTP-lockout guard (21610) — required.**
The forward line is the *same number* that sends account OTP codes, so a user who
texts `STOP` lands on one opt-out list that also blocks their **login codes**.
Their next OTP send fails with Twilio **21610** ("recipient has opted out") and
the code silently never arrives — locked out until they text `START`.

I confirmed `notifications.service_internal.send()` today wraps **every** provider
exception into `{"error": …}, 502`, so 21610 is currently indistinguishable from a
real outage. Change:
- Catch `TwilioRestException` with `code == 21610` **before** the generic handler
  (at `TwilioProvider.send` or in `send()`), and return a distinguishable
  `opted_out` result (not a 502).
- `auth`'s OTP-start path special-cases `opted_out` and returns it to the client.
- **webui**: the just-rebuilt login flow (`web/app/(guest)/login/page.tsx` +
  `startOtp`) renders an `opted_out` branch: *"You've opted out of texts from
  Waygerz. Text START to +18335885058 to get your login code."* Without this UI
  surface the fix stops at the API and the user still hits a dead end.
- Log as `opted_out` (greppable; does not page as an outage).
- Optional follow-on: on 21610 flip the user's in-app SMS pref off so settings
  reflect reality without a full Twilio-status sync.

## Configuration & secrets (how settings are saved)

Env-driven `Config` class like every other service, split by sensitivity:

| Setting | Where it lives | Notes |
|---|---|---|
| `TWILIO_AUTH_TOKEN` (validate + REST) | **SSM SecureString** `/waygerz/TWILIO_*`, injected via taskdef `secrets`/`valueFrom` | never in the repo; reuses the existing param |
| `TWILIO_ACCOUNT_SID`, `TWILIO_FROM` | SSM or taskdef `environment` | SID pairs with the token for REST sends |
| `FORWARD_TO` (destination roster) | **SSM JSON param** `/waygerz/TWILIO_FORWARD_TO`, injected as an env var | list of `{"number": "+1…", "name"?: "Sam"}`; numbers **normalized to E.164** on load. **Boot validation**: non-empty and ≤ `FORWARD_MAX` (else refuse to start); over-cap is a config error, not a silent truncation. Injected at container start, so a change needs a `force-new-deployment` **restart** (no image rebuild) — not hot. (Truly hot edits ⇒ read via boto3 + task role at request time — deferred.) |
| `TWILIO_WEBHOOK_BASE_URL` | taskdef `environment` | drives signature validation |
| `TWILIO_VALIDATE_SIGNATURE` (default true) | code default true; compose sets false | never false in prod |
| `VOICE_SCREEN` (default true) | taskdef `environment` | keypress screening on/off (voicemail exclusion vs. no press-1) |
| `FORWARD_MAX`, rate-limit window | taskdef `environment` | fan-out cap + abuse guard |
| `REDIS_URL` | taskdef `environment` (mesh redis) | backs the per-sender rate-limit counter |

**Normalization**: `FORWARD_TO` entries and `TWILIO_FROM` are parsed to canonical
E.164 at load, so the self-exclude / sender-exclude comparisons can't be defeated
by `+1833…` vs `833…` formatting.

**Observability.** No DB, so lean on structured logs: one line per inbound
(`event`, `from`, `num_forwarded`, `failures`, `rate_limited`) and per voice call
(`from`, `screened_out`, `bridged`, `DialCallStatus`), so support can triage from
`/ecs/waygerz/twilio` without a datastore. (Note: the `users` split left its log
group missing once — confirm `/ecs/waygerz/twilio` is created with the service.)

**Stateless — no schema, no DB.** All persistent state is config; the rate-limit
counter lives in Redis. Keeps the container ~128 MB (fits the 2 GB host), no
migration. (Add a `twilio` schema later only if we want an inbound audit trail.)

## Service layout (mirror `api/auth/` template, minus DB)

```
api/twilio/
  Dockerfile              # copy from notifications (python:3.12-slim, gunicorn gthread)
  requirements.txt        # Flask + gunicorn + redis + twilio==9.10.9 (no db/jwt/cors/boto3)
  wsgi.py                 # app = create_app()
  app/__init__.py         # factory: NO cors (no browser calls this), no db/jwt/migrate
  app/extensions.py       # redis singleton only
  app/utils/config.py     # Config (group=platform, name=twilio) + Twilio + FORWARD_TO/E.164
  app/utils/guards.py     # twilio_signature_required (matched-route-path aware)
  app/routes/__init__.py  # open /health + signature-guarded webhook bp; NO /internal bp
  app/routes/route_webhooks.py
  app/controllers/controller_webhooks.py
  app/services/service_voice.py   # simulring + screen + fallback TwiML
  app/services/service_sms.py     # bounded best-effort fan-out via Twilio REST + rate limit
  tests/
```

Mounts at `Config.api_prefix()` = **`/v1/platform/twilio`** (verified: prefix is
`f"/v1/{SERVICE_GROUP}/{SERVICE_NAME}"`); health at `/v1/platform/twilio/health`.

## Routing & infra wiring

- **Dev gateway** (`api/gateway/conf.d/default.conf`):
  `location /api/v1/platform/twilio { proxy_pass http://twilio:8000/v1/platform/twilio; }`
  (parity; Twilio only ever hits prod).
- **Prod ALB**: new `twilio-tg` (health `/v1/platform/twilio/health`) + listener
  rule `/v1/platform/twilio/*` → `twilio-tg`. Standard per-service pattern.
- **ECS Service Connect**: in the chosen direct-REST design `twilio` makes **no
  east-west calls** (it's reached north-south via the ALB target group and only
  egresses to Twilio), so mesh registration is **not functionally required** —
  register it anyway for uniform Cloud Map presence, and it becomes *required* only
  if open-decision #1 flips to the `notifications /internal/sms/send` chokepoint.
- **compose**: `twilio` block (build `./twilio`, `SERVICE_GROUP=platform`,
  `SERVICE_NAME=twilio`, Twilio env, `FORWARD_TO`, `TWILIO_VALIDATE_SIGNATURE=false`,
  128 MB, `depends_on` redis only).
- **CI/deploy**: `waygerz/twilio` ECR repo, `twilio/taskdef.json`, add `twilio` to
  the `build-and-deploy.yml` matrix.
- **Secrets/rotation**: reuse `/waygerz/TWILIO_*`. The auth token exposed earlier
  still needs rotation before go-live — it's now also this service's request
  authenticator, so rotation matters more.

## Twilio console (after deploy)

Voice and SMS are configured in **different places** — a common mix-up:
- **Voice (always number-level)**: Phone Numbers → the number → Voice Configuration
  → "A call comes in" → **Webhook, POST** →
  `https://waygerz.com/v1/platform/twilio/voice`.
- **SMS**: if the number is in a **Messaging Service** (the opt-out precondition),
  set it on **Messaging Service → Integration → "Send a webhook"** →
  `https://waygerz.com/v1/platform/twilio/sms`. If the number is standalone, set it
  on the number's Messaging Configuration instead.
- Enable **Advanced Opt-Out** on the Messaging Service (or rely on default opt-out
  if standalone).

## Mobile impact

None — inbound call/SMS forwarding is entirely provider↔backend↔staff phones. The
Flutter apps don't touch it; nothing to build in `mobile/` now. The only
user-visible tie-in is the 21610 `opted_out` login message, which both web and (a
future) mobile login must render.

## Build sequence

1. Scaffold `api/twilio/` from the notifications template; strip DB/JWT/migrate/cors;
   add `twilio_signature_required` (matched-route-path aware, `/health` exempt) +
   `FORWARD_TO` E.164 parse.
2. `/voice` simulring + `/voice/screen` whisper + `/voice/after` fallback (+ tests).
3. `/sms` bounded best-effort fan-out via Twilio REST + Redis rate limit +
   sender-exclude group behavior (+ tests, incl. multi-recipient + staff-reply echo).
4. **`notifications` OTP-lockout guard**: catch 21610 → `opted_out`; surface in
   `auth` OTP-start; **render the `opted_out` branch in the webui login flow**
   (+ tests).
5. Wire compose + gateway; taskdef + CI matrix; ALB TG/rule + Service Connect
   (AWS-side scripted for CloudShell, not run from here).
6. Confirm the Messaging Service + Advanced Opt-Out; configure webhooks; live-test:
   a call (all phones ring, voicemail is screened out, first human connects,
   nobody answers → fallback), a text (all phones receive the copy; a staff reply
   re-broadcasts to others but not the sender), and a STOP → START round-trip
   confirming OTP delivery blocks then resumes with the guard message shown.

## Verification

- **Unit**: signature accept/reject (tampered, missing header) on each guarded
  route incl. both POSTs to the self-referential `/voice/screen`; **`/health`
  reachable with no signature**; `/voice` emits `<Dial>` with a screened
  `<Number url>` per `FORWARD_TO` + `answerOnBridge` when `VOICE_SCREEN` on, and a
  bare `<Number>` when off; `/voice/screen` returns empty `<Response/>` on
  `Digits=1` (bridge), hangs up on a wrong key and on no-input; `/voice/after`
  speaks the fallback when `DialCallStatus != completed` **or**
  `DialCallDuration < 2` (all-voicemail case); `/sms` issues one outbound per destination
  (sender-prefixed), excludes the sender when `From ∈ FORWARD_TO`, continues past a
  single failed send, and honors the rate-limit cap; E.164 normalization defeats
  `+1833…`/`833…` mismatch; `TWILIO_VALIDATE_SIGNATURE=false` bypass works in dev
  only; all webhook responses are `text/xml`.
- **notifications**: 21610 returns `opted_out` (not 502); non-21610 errors still
  surface as failures.
- **Live**: as in build step 6.
- Backend pytest only; do **not** run Next/Flutter builds on this host.

## Open decisions for you

1. **SMS outbound path**: send forwards **directly** via Twilio REST (recommended,
   simplest) — or route through a new `notifications /internal/sms/send` chokepoint?
2. **Caller ID on `/voice`**: **RESOLVED — main Waygerz number** (`caller_id=TWILIO_FROM`).
3. **`FORWARD_TO` scope**: **RESOLVED — same number** as the account-OTP toll-free
   (+18335885058). Outbound OTP unaffected (webhook fires on inbound only);
   self-exclude guard; no TFV impact.
4. **Staff-reply behavior**: **RESOLVED — group broadcast** (reply from a
   `FORWARD_TO` number re-broadcasts to the others, excluding the sender). Flip to
   "drop staff replies" if you'd rather.
5. **Fan-out execution**: synchronous-with-cap for v1 vs. immediate-ack + worker
   thread. Default: synchronous with `FORWARD_MAX` cap; revisit if the list grows.
