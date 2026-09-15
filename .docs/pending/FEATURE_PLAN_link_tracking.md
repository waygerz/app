# Feature plan: `/c/R` link shortening & click tracking (in `notifications`)

Planned 2026-09-15 (revised after 3 audits + a design call). **Goal: A + B.**
- **A — know who *opened* a pick'em notification** (in-app + push engagement).
- **B — deliver pick'em links over SMS short + click-tracked.**

⚠️ **B fires only for SMS-opted-in users.** `pickem_week` is category
`league_alert`, whose SMS default is **off** (`service_internal.py:31`), so `send()`
returns `skipped:muted` for the default user and no `/c/R` link is minted/sent for
them — they get in-app/push (A) only. So B — and the `/c/R` shortener's whole
reason to exist — matters only for users who opt into `league_alert` SMS. **Confirm
that's acceptable**, or plan to change the default / prompt for SMS opt-in;
otherwise A (in-app tracking, no `/c/R` needed) is nearly the whole story and the
shortener is low-value.

**Design (settled): one `/c` system, a new `R` (redirect) code type, hosted in the
`notifications` service. NO new service, NO `/l` root.** `/c/R<code>` is served
server-side by notifications (resolve → log click → `302`); `/c/B|L|F` (the
existing invite/bet/friend *action* codes) keep going to the webui page,
unchanged. The split is done at the routing layer (an ALB rule), so the user only
ever sees one `/c`, consistent with the existing "leading letter picks the owner"
convention (`B`/`L`/`F` → `+R`).

**Why not `/l` / a `links` service:** a redirect is a server-side 302, not a
client page — but `/c` codes are prefix-routed already, so `/c/R*` can be routed
to a backend *before* webui without a new root or a new service. Folding it into
`notifications` is natural: it already builds and sends these links and will own
the click analytics, so A and B land in one store and unify for free.

---

## Scope — what gets shortened+tracked
`notifications` shortens the `{{link}}` at **send time**, so **emitter services do
not change**. ⚠️ Emitters pass an **absolute** URL (`https://waygerz.com/…`), so the
rule is: **parse the link, confirm the host is our own origin, strip to a relative
`path+query`; shorten iff that path is NOT under `/c/`** (and passes the allowlist).
So "reject absolute" below means "reject an absolute URL whose host isn't ours" —
our own origin is stripped, not rejected. The in-scope set is exactly:
- **pick'em** `pickem_week` → `/leagues/<uuid>/results?week=N` or
  `/leagues/<id>/play` (the long URLs — the real shortening win + primary tracking
  target),
- `league_invite` → `/leagues`, `friend_request` → `/friends` (tracked; already
  short so no length gain — bare-list targets, weak signal, but free to include).

**Excluded (left bare):** every `/c/B|L|F` link (wager links, shared invite links)
— already short, own resolver, and re-wrapping a `/c` in a `/c/R` is explicitly
disallowed by the shorten rule (target under `/c/` → skip). So `/c/R` never points
at another `/c`.

## Architecture (all in `notifications`)
- **Store** (`notifications` schema, one migration):
  - `redirect_links`: `{ code (PK, leading `R` + the existing 32-char
    no-ambiguous `_CODE_ALPHABET` "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" that
    contests/leagues/friends already use — NOT base62; ~7 body chars),
    target_path (same-origin relative), kind (template_key), created_at }`.
    **Idempotent** per `(target_path, kind)` — one code reused across all
    recipients of a send. ⚠️ Because a pick'em week-open **fans out per member**
    (100k for the global league), 100k identical `shorten(target,kind)` calls
    race — a naive select-then-insert produces a unique-violation storm. Add a
    **unique index on `(target_path, kind)`** and mint with **`INSERT … ON
    CONFLICT DO NOTHING` then re-select** (concurrency-safe upsert).
  - `link_clicks`: append a row / bump a rollup on each engagement, from **both**
    channels: `{ kind, user_id?, source ('link' | 'inapp'), code?, at, ua?, ip? }`.
    Prefer per-(code|kind, user) **counter rollups** over unbounded raw rows.
- **B — shorten at send, SMS branch only:** shorten inside `notify()` **on the
  copy of the context passed to the SMS `send()`** (`service_internal.py:390-399`),
  NOT the shared `render()` at `:351` (which builds the in-app feed body) and NOT
  inside `render()` itself (it's a pure fn re-run per channel — minting there
  double-fires). So the in-app feed keeps the full link (nav uses the separate
  unshortened `deep_link` anyway) and only the SMS text carries `/c/R<code>`. If
  the target is shortenable (rule above), call the concurrency-safe
  `shorten(target, kind)` → substitute. **Best-effort**: on any mint failure emit
  the direct link (never withhold). Emitters untouched.
- **B — the redirect:** **`GET /c/R<code>`** on notifications (public, edge; a new
  non-`/v1` blueprint registered at `/c`). One handler: look up target (cached —
  immutable), record a `link` click, **`302`** to the target **preserving the
  target's query string** (`?week=N`). Requirements:
  - **Optional JWT, and CATCH decode failures.** `verify_jwt_in_request(optional=True)`
    swallows a *missing* cookie (→ anonymous) but still **raises on an
    expired/malformed** one — and a stale SMS tap days later is *exactly* an
    expired `waygerz_access`. So the handler must **try/except the decode and fall
    back to anonymous**, never let it 5xx. (flask-jwt-extended is already wired in
    notifications — shared secret, cookie `waygerz_access` — no new setup.)
  - **Use 302, never 301** (301 is cached forever and skips the tracker on repeat);
    the `Location` is the stored **relative** `path+query` (browsers accept a
    relative Location — no need to reconstruct the absolute origin).
  - **Cache the target lookup only — every tap still logs a click, EXCEPT log
    nothing on a code MISS** (don't let `/c/R<random>` scans write rows).
  - **Client IP from `X-Forwarded-For`/`X-Real-IP`** (behind ALB/nginx), never
    `remote_addr`, for the dedup key.
- **A — in-app/push open tracking:** record the `source='inapp'` click on the
  **genuine open path only** — the webui `openItem` (`notifications/page.tsx:210`)
  — **NOT** the shared `/me/read` markRead endpoint, which also fires from
  **Mark-all-read** (`:229`), inline Accept/Reject (`:187/:199`), and CounterButton
  (`:350`) → that would over-count. So add a distinct write (its own endpoint/param
  triggered from `openItem`), keyed by `template_key` + user; the notifications
  service derives `template_key` by looking the notification row up (it already
  queries by id). **Fire-and-forget** — `mutate` without `await`, mirroring the
  existing `markRead`, so it never delays `router.push`. Lands in the **same
  `link_clicks` store**. No `/c/R` for in-app taps — they use the client
  `deep_link`, not a web redirect. (`openItem` guards `if (!n.read)`, so only the
  first open is counted — fine for per-(kind,user) rollups.)
- **Unify (A+B):** because both channels write `link_clicks` keyed by
  `(kind, user)`, "who engaged with the pick'em notification" is one query over
  the two sources.

## Routing
- **Prod ALB:** one rule `/c/R*` → **notifications** TG, at higher priority than
  the webui default. `/c/*` (i.e. `B`/`L`/`F`) keeps hitting webui. (Precedent:
  every `/v1/*` group already has an ALB→TG rule; this is the same mechanism, just
  a `/c/R*` path pattern.)
- **Local compose:** one nginx block `location /c/R { proxy_pass http://notifications:8000/c/R; }`
  in `api/gateway/conf.d/default.conf` (today all non-`/api` → webui, so without it
  `/c/R` would wrongly hit webui). nginx longest-prefix routes `/c/R…` here while
  `/c/B…` still falls to `location /` → webui. Gotchas: (a) `location /c/R` with
  **no trailing slash** (else it won't match `/c/Rabc`); (b) add **no
  `proxy_set_header`** in the block so it inherits the server-level
  `X-Real-IP`/`X-Forwarded-For`/`X-Forwarded-Proto` needed for IP dedup.
- **No `proxy.ts` change** — webui never serves `/c/R`. No new gateway/ALB *service*,
  just the one path rule + one local location.

## Safety & failure
- **Open-redirect guard (in notifications, Python, at shorten-time):** first
  **normalize** — parse the emitter's absolute URL, require `host == our origin`
  (reject if not ours), strip to `path+query`. Then on that relative path:
  **allowlist** the known leading segments (`/leagues`, `/friends`); reject
  **protocol-relative (`//evil`)** and **backslash (`/\evil`)** forms and
  control/whitespace chars; and by construction never a `/c/...` path. **Preserve
  the query string** (`?week=N`) — validate the path portion, keep the query on both
  the stored `target_path` and the 302. Store only the relative `path+query`.
- **⚠️ Unthrottled public DB-touching endpoint in prod.** The prod ALB routes
  `/c/R*` straight to the notifications TG with **no rate limit** (ALB doesn't
  rate-limit without WAF; the compose nginx 30r/s cap only exists locally). Each
  `GET /c/R<random>` is a lookup. Mitigate: **cache resolves**, **don't write on a
  code miss** (above), and add **WAF/rate-limiting** in front of `/c/R*`.
- **`/c/R` makes notifications tap-path-critical** — today it's only on the *send*
  path; after this it's on the *read/tap* path for **every sent SMS link**, which
  can't fall back to the direct target once sent. So notifications must stay HA. A
  bad/expired code → `302 /`; a *transient* resolve failure → `302 /` **silently
  drops the destination** (unrecoverable from the URL) — degraded, not broken.
- **Bot / link-preview inflation:** SMS/iMessage/Slack/scanners prefetch URLs.
  Count **GET only** (ignore HEAD), filter known bot UAs, honor `Purpose:
  prefetch`/`X-Purpose`, best-effort dedup per (code, ip/ua) short-window.
- **Click counts are directional engagement analytics, not billing** — integrity
  isn't load-bearing, so bot filtering + best-effort dedup are enough.
- **No Twilio link shortening** — our `/c/R` handles SMS; keep Twilio's feature OFF.
- **SameSite:** attribution needs the auth cookie on the top-level cross-site GET;
  auth defaults `JWT_COOKIE_SAMESITE=Lax` (sent on nav). It's env-driven
  (`AUTH_COOKIE_SAMESITE`) — **verify the prod auth taskdef isn't `Strict`**, else
  attribution silently fails (still 302s, just anonymous).
- **Prereq (orthogonal, prod):** the ALB `/internal`+`/admin` edge-deny is still
  TODO (`ROUTING_AUDIT_REMEDIATION.md`); it must be in place regardless — adding a
  public `/c/R` on notifications doesn't change it, but don't ship public routes on
  a service whose `/internal` isn't edge-denied in prod.
- **Privacy + account purge (must-fix):** `link_clicks` carries user_id+IP+UA
  (PII). The notifications purge-user job enumerates each table it deletes
  (`service_internal.py:485-497`: Notification/Message/DeviceToken/prefs) — a new
  `link_clicks` table would **orphan a deleted account's PII**, so add `link_clicks`
  (by user_id) to that delete set. `redirect_links` are shared, user-less and
  immutable → **not** purged. Also add a **time-retention TTL** for `link_clicks`
  (no time-based purge job exists today) and **disclose click tracking in the
  privacy policy** (open counsel item).

## Scale (ties to the global pick'em)
- Per-`(target, kind)` codes keep volume tiny: a league-week link is **one** code
  shared by all recipients — even the 100k global league adds a few codes/week,
  not 100k.
- `link_clicks` is the volume risk at 100k → **counter rollups**, not raw events
  (or sample/TTL raw).

## Analytics
- **Granularity:** per-`(target, kind)` slices clicks by notification *type*, not
  by which *send* — fine for engagement; per-send codes are a deferred upgrade.
- **Unified metric:** define "opened/clicked the pick'em notification" as the union
  of `source='link'` (SMS `/c/R` taps) + `source='inapp'` (feed opens), grouped by
  `kind`/`template_key`. Decide this shape up front so both writers agree.

## Mobile
- Universal Links / App Links: keep `/c/B|L|F` and the **target** routes
  (`/leagues`, `/friends`) mapped to the app; **do NOT** claim `/c/R` for the app —
  let it open in the browser so notifications can 302 (then the target route is
  intercepted natively). Association files (`/.well-known/apple-app-site-association`,
  `assetlinks.json`) served by webui/gateway. Note for the mobile build; no work now.

## v1 build sequence
1. **notifications store** — migration: `redirect_links` (**unique index on
   `(target_path, kind)`**) + `link_clicks` (rollup counters). Code-gen = leading
   `R` + the existing `_CODE_ALPHABET` (no base62). Mint via concurrency-safe
   `INSERT … ON CONFLICT DO NOTHING` + re-select.
2. **shorten at send** — in `notify()`, shorten only the **SMS-branch** context
   copy (`service_internal.py:390-399`), not the shared `render()` / not inside
   `render()`; only a non-`/c` same-origin path, allowlist-validated, query
   preserved; best-effort direct-link fallback. Emitters unchanged.
3. **`GET /c/R<code>` blueprint** (new, non-`/v1`, registered at `/c` in
   `register_blueprints`) — `verify_jwt_in_request(optional=True)` **wrapped in
   try/except → anonymous** (an expired cookie must not 5xx), cached resolve,
   `302` (relative Location) preserving `?week`, GET-only + bot/prefetch filtering,
   **no write on a code miss**, client IP from `X-Forwarded-For`.
4. **Routing** — prod ALB `/c/R*` → notifications TG (+ WAF/rate-limit); local
   gateway `location /c/R` (no trailing slash, inherit `X-Forwarded-For`).
5. **A — in-app open tracking** — a distinct `source='inapp'` click written
   **fire-and-forget** from webui `openItem` **only** (not the shared markRead),
   `template_key` derived service-side from the notification row.
6. **Unified read** — an internal/admin query (later a small dashboard) over
   `link_clicks` grouped by `kind` × source.

Deploy order when built: notifications (migration) → the ALB `/c/R*` rule (with
WAF) → webui (step 5 touches the feed). Confirm the prod ALB `/internal` deny and
`AUTH_COOKIE_SAMESITE=Lax` first. Commit each edit; deploy only when told.

## Open decisions
- **Emitter-side shorten vs send-time shorten** — plan assumes **send-time** in
  notifications (zero emitter changes). Only revisit if a link needs shortening
  outside a notification (e.g. a shared/browser-issued link) — deferred.
- **Raw click events vs counter rollups** — leaning rollups from day one, optional
  sampled raw for debugging.
- **Per-send codes** (campaign-level attribution) — deferred; per-`(target,kind)`
  is enough for engagement.
