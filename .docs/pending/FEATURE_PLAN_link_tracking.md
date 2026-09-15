# Feature plan: `/l` link shortening & click tracking

Net-new subsystem, planned 2026-09-15. A single front door for every **outbound**
link the platform emits (SMS, push-opened-in-browser, shared invite links): issue
a short `https://waygerz.com/l/<code>` that **logs a click** (attributing to the
viewer's session when present) and **302-redirects** to the real destination.

**Why:** (1) know *who clicked* a notification/link — cross-channel engagement
analytics; (2) short links for SMS (a `/l/AbC123X` ≈ 28 chars vs the ~75-char
UUID URLs today, ~half a segment saved). Mirrors the existing public `/c/<code>`
resolve pattern.

**Out of scope:** in-app `deep_link` values (e.g. notifications' tap target) —
those are client-side `router.push` routes, not URLs that leave the app; instrument
those taps client-side, not through `/l`.

**Decisions locked (react before build):** dedicated `links` service; **per-link
codes + session attribution** (not per-recipient) in v1; **idempotent shorten**
(one code reused per (target, kind)); shorten is **best-effort with a direct-link
fallback** so a notification link is never blocked; **no Twilio link shortening**
— our `/l` handles SMS too (keep Twilio's feature off).

**Corrected after the 2026-09-15 audit** (the original draft's core hop was
impossible): **`resolve` is a PUBLIC `/v1/platform/links/resolve` route** (webui
is not meshed and `/internal/*` is edge-denied), **attribution is done LINKS-SIDE**
(webui can't decode the JWT — it forwards the cookie), and the `/l` tap path
**rides the unresolved private-zone drift** until webui is meshed. See Architecture
+ Failure & safety.

**Prerequisite:** ideally **mesh webui as a Service Connect client first**
(`ROUTING_AUDIT_REMEDIATION.md` finding #6) so the resolve hop is in-VPC and not
on the drift path; otherwise accept that every `/l` tap depends on the re-pinned
private zone.

---

## What emits an outbound link today (the migration inventory)
- **contests** `service_wagers.py` `_wager_link` → `https://waygerz.com/c/<Bcode>`
  (wager_proposed / accepted / countered / settled_win / settled_loss).
- **leagues** `service_leagues.py`: `pickem_week` link (`:187`,
  `/leagues/<id>/results?week=N` or `/play`); `league_invite` link (`:1694`,
  `https://waygerz.com/leagues`).
- **friends** `service_friends.py`: `friend_request` link (`:78`,
  `https://waygerz.com/friends`).
- **webui** `lib/invites.ts` `inviteUrl(code)` → `https://waygerz.com/c/<code>` for
  the **shared** league-invite and friend "add me" links.
- (Unwired: `weekly_digest`.) In-app `deep_link` is excluded per above.

Every one of these becomes: build the real target as today → call the links
service `shorten(target, kind)` → emit `https://waygerz.com/l/<code>` instead.

## Architecture
- **New `links` service** (mesh `links:8000`, group `platform` →
  `/v1/platform/links`). Owns the store, the internal `shorten`, and the
  click-log. A dedicated service (not folded into notifications) keeps the public
  redirect path independently scalable/reliable — it sits in front of *every*
  link tap.
- **`/l/<code>` resolve** is a **Next.js Route Handler** in webui
  (`app/(public)/l/[code]/route.ts`) — a handler (not a page), no render, just a
  fast `NextResponse.redirect(target, 302)`. It calls the links service to resolve
  the target + record the click, then redirects.
  - **⚠️ How the handler reaches links (audit 2026-09-15 MUST-FIX #1/#2):** webui
    is **NOT in the Service Connect mesh** (`web/taskdef.json` is bridge-mode, no
    `serviceConnectConfiguration`; `ROUTING_AUDIT_REMEDIATION.md` finding #6 is
    still TODO), so the handler **cannot** call `http://links:8000`. Its only
    SSR path is `API_INTERNAL_URL = https://waygerz.com` (the ALB, via the
    drift-prone private zone), and the ALB/gateway **404s `/internal/*`**.
    Therefore the resolve endpoint the handler calls **must be a PUBLIC
    `POST /v1/platform/links/resolve`** (edge-reachable, abuse/rate-limit
    guarded) — NOT `/internal/resolve`. And note the tap path **rides the
    unresolved private-zone drift bug** (`ROUTING_AUDIT_REMEDIATION.md` §1,
    finding #1a): either **mesh webui first** (finding #6) or accept that every
    `/l` tap depends on the re-pinned zone. Do not claim "in-VPC via mesh."
  - **Cache + 302:** the handler/links should **cache** the immutable code→target
    lookup (Redis/in-memory) so a tap isn't a DB hit; use **302 (never 301)** so
    browsers don't permanently cache the redirect and skip the tracker on repeat.
  - `proxy.ts`: add `/l` to `PUBLIC_PREFIXES` (alongside `/c`,`/terms`,`/privacy`)
    — REQUIRED, else the middleware 302s a logged-out `/l` tap to `/login` and
    breaks SMS.
  - Gateway/ALB: `/l/*` is non-`/api`, so it already routes to webui — **no
    gateway/ALB change** for `/l` itself (the resolve route is a normal `/v1/...`
    already forwarded).
- **Store** (`links` schema):
  - `links`: `{ code (PK, base62 ~7-8 chars), target_path, kind (template_key/
    campaign), created_at, created_by?, expires_at? }`. `target_path` is stored
    as a **relative path** (`/c/<code>`, `/leagues/…`) and the redirect prepends
    the canonical origin — never store/redirect to an arbitrary external host
    (open-redirect guard: only same-origin relative paths).
  - `link_clicks`: `{ id, code, user_id?, at, ua?, ip? }` (raw events; roll up to
    per-code counts for cheap reads). Consider retention TTL (privacy + volume).
- **shorten (internal, mesh-only):** `POST /internal/shorten { target_path, kind }`
  → `{ code, url }` (`X-Internal-Token`). Called by the Flask emitter services,
  which ARE in the mesh. **Idempotent**: same (target_path, kind) reuses the
  existing code (a bet's `/c/<Bcode>` gets one `/l` code for its life, not one per
  send).
- **resolve (PUBLIC, edge-reachable):** `POST /v1/platform/links/resolve { code }`
  with the caller's `waygerz_access` cookie forwarded → `{ target_path }`, and it
  records the click (deriving `user_id` from the cookie links-side). **Public**
  because the `/l` webui handler is not meshed and reaches it through the ALB;
  **rate-limit / abuse-guard it** since it's edge-exposed. Never `/internal/*`
  (edge-denied).

## Attribution — how we know "who clicked"
- **v1: per-link code + session, resolved LINKS-SIDE (audit MUST-FIX #3).** webui
  **cannot decode the JWT** itself — it has no `JWT_SECRET_KEY` env and no
  jose/jsonwebtoken dependency. So the `/l` handler **forwards** the
  `waygerz_access` cookie (read via `next/headers`) to the links `resolve`
  endpoint, and **links** — flask-jwt-extended, shared secret,
  `locations=["cookies","headers"]` like every other service — derives the
  `user_id` (optional) and records it on the click. A **logged-out** tap (common
  from SMS) is an **anonymous** click.
- **⚠️ Attribution depends on the cookie's `SameSite`.** A tap from an external
  app (SMS/Messages) is a top-level cross-site navigation: `SameSite=Lax` cookies
  ARE sent (→ attributed), `SameSite=Strict` would NOT be (→ anonymous even when
  logged in). Confirm `waygerz_access` is `Lax` before assuming SMS attribution
  works.
- **Deferred: per-recipient codes** (a unique `/l` code per member per send) →
  exact identity even for logged-out SMS taps, at the cost of code volume. Only if
  SMS-tap-level identity becomes a real need.

## Failure & safety
- **shorten() is best-effort:** if the links service is unreachable when a
  notification is built, fall back to emitting the **direct** target URL — a link
  is never withheld because tracking is down. (shorten is server-to-server from a
  Flask service, which IS in the mesh → `http://links:8000/internal/shorten`,
  `X-Internal-Token`. Only *resolve* is public/edge-reachable, per Architecture.)
- **⚠️ Resolve is a new single point of failure (audit MUST-FIX #5).** `/l` sits in
  the tap path of **every migrated link**, and once an `/l` SMS link is *sent* it
  can't fall back to the direct target. Today `/c/<code>` resolves client-side
  against the already-HA contests/leagues services with **no** links service in the
  path — so `/l` makes links-service (and webui-SSR) availability **load-bearing
  for every previously-sent message**, and it inherits the private-zone drift path
  (finding #1a). Accept only if links is HA and (ideally) **webui is meshed first**.
  A bad/expired code → `302 /` is sane (mirrors `/c`); but a **transient** resolve
  failure → `302 /` **silently drops the user's real destination** — a real (if
  degraded) regression to state explicitly.
- **Open-redirect guard (audit MUST-FIX #4):** only same-origin **relative**
  `target_path`s, validated **at shorten-time**. Reject not just absolute URLs but
  **protocol-relative (`//evil.com`)** and **backslash (`/\evil.com`)** forms,
  which normalize into off-site redirects once prefixed. Enforce
  `path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')`.
- **⚠️ Bot / link-preview inflation.** SMS, iMessage, WhatsApp, Slack, email and
  security scanners **prefetch** URLs to build previews — they hit `/l/<code>`
  before any human taps, polluting click data. Count **GET only** (ignore HEAD),
  filter known bot UAs, honor `Purpose: prefetch` / `X-Purpose` headers, and dedup
  per (code, ip/ua) within a short window.
- **No Twilio link shortening (decided 2026-09-15).** SMS links go through our
  `/l` only — keep Twilio's Messaging **Link Shortening / Click Tracking feature
  OFF** so links aren't double-wrapped or double-counted.
- **Privacy:** click logs tie a person + IP + UA to a tap — keep them internal, set
  a retention window, and **disclose click tracking in the privacy policy** (ties
  to the still-open `/terms` + `/privacy` counsel item).

## Migrating ALL links (sequence)
0. **(Prerequisite, recommended)** mesh webui as a Service Connect client
   (`ROUTING_AUDIT_REMEDIATION.md` #6) so the resolve hop is in-VPC, not on the
   drift path. If skipped, accept the re-pinned-zone dependency for every tap.
1. **links service** — schema + migration, internal `shorten` + **public**
   `resolve` (rate-limited, links-side JWT attribution), click-log, per-code count
   rollup, shorten-time open-redirect validation. Register in Service Connect
   (`links`, port `http`).
2. **`/l` route handler** in webui (calls public `resolve`, forwards the cookie,
   302, GET-only + bot filtering, cache) + `proxy.ts` PUBLIC_PREFIX.
3. **Migrate emitters** (each calls `shorten()` with a best-effort direct-link
   fallback):
   - contests `_wager_link`;
   - leagues `pickem_week` + `league_invite` links;
   - friends `friend_request` link;
   - webui `inviteUrl()` (shared league/friend links) — via an SSR/internal
     shorten (or a small `/api`-fronted shorten) so the browser gets the `/l` form.
4. **Analytics read** — an internal/admin endpoint (or query) for per-code and
   per-recipient click counts; later a small dashboard.

## Scale (ties to the global pick'em)
- Idempotent per-target codes keep volume low: a league-week link is **one** code,
  not one per member — so even the 100k global league adds a handful of codes per
  week, not 100k.
- `link_clicks` is the volume risk at 100k: prefer **counter rollups** (increment
  per code, optionally per (code,user)) over unbounded raw events, or sample/TTL
  raw rows.

## Analytics granularity & cross-channel
- **Granularity limit of the v1 code scheme:** reuse-per-(target,`kind`) means you
  can slice clicks by notification *type* (`kind`/`template_key`), but NOT by which
  *send* drove a click when the same target is linked from multiple sends — same
  code. Per-send/per-campaign attribution is the per-send-code upgrade (deferred).
- **Cross-channel consistency:** in-app taps are NOT `/l` links (they're
  client-side `deep_link` router pushes) — track those via the notifications
  feed's existing read/tap state. So unified "click-through" reporting must union
  two sources: `/l` clicks (SMS/push-browser/share) + in-app tap state. Decide the
  combined metric up front so the `kind`/`template_key` dimension lines up.

## Mobile
- Native apps (Flutter, planned): `/l` links open the browser → 302 → the target
  deep link. Universal Links / App Links config must map **`/l`** (and `/c`) to the
  app so a tap opens natively. Note for the mobile build; no work now.

## Cross-cutting
- No gateway/ALB change (`/l` is non-`/api`, served by webui like `/c`).
- `web/lib/api-paths.ts` gains the `links` prefix; `proxy.ts` PUBLIC_PREFIXES gains
  `/l`.
- New service → one migration in the `links` schema. **shorten** stays internal
  (`X-Internal-Token`), reached by Flask services over the mesh
  (`http://links:8000`) — never the ALB form. **resolve** is the exception: it's a
  PUBLIC `/v1/platform/links/resolve` route because its caller (the `/l` webui
  handler) is not meshed — so it goes through the ALB and must be abuse-guarded.
  Register `links` in Service Connect (port `http`).
- Commit each edit; deploy only when told.

## Open decisions
- Dedicated `links` service (recommended) vs fold into `notifications`.
- Raw click events vs counter rollups from day one (leaning rollups + optional
  sampled raw for debugging).
- Whether shared invite links (`inviteUrl`) shorten client-side (needs a public
  `/api` shorten, rate-limited) or only server-issued links shorten in v1.
