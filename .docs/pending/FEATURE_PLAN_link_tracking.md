# Feature plan: `/l` link shortening & click tracking

Net-new subsystem, planned 2026-09-15. A front door for the platform's **outbound
direct-navigation links** (SMS, push-opened-in-browser) — **excluding `/c` invite/
bet codes** (see Scope): issue a short `https://waygerz.com/l/<code>` that **logs a
click** (attributing to the viewer's session when present) and **302-redirects** to
the real destination.

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

**Architecture (settled over two 2026-09-15 audits): `/l` is served directly by
the `links` service via an ALB `/l/*` rule — NOT through webui.** `/l` is a pure
redirect (no render, unlike the `/c` *page*), so `GET /l/<code>` on the links
service does resolve → log → `302` in one hop: browser → public-zone ALB → links.
This is a north-south request, so it never touches the drifted private zone, and
it removes what the first audit flagged: no webui-SSR hop, **no "mesh webui first"
prerequisite**, no private-zone-drift SPOF, no cookie-forwarding, and no separate
public resolve endpoint. Attribution is done **inside links** — a `Lax`
`waygerz_access` cookie is sent on the top-level GET to `waygerz.com/l/…`, and
links (flask-jwt-extended, shared secret) decodes it directly. Cost vs the
rejected webui-handler design: **one ALB `/l/*` rule** (priority above the webui
default) **+ one gateway `location /l/`** block for local compose.

---

## Scope — `/l` covers direct-navigation links only, NOT `/c` codes
**Decided 2026-09-15:** `/l` does **not** wrap `/c/<code>` invite/bet links. `/c`
links are already short and carry their own resolver; we don't need to track code
clicks, and wrapping them would only add a redirect hop. So `/l` never redirects
to a `/c` — it shortens/tracks the *plain in-app route* links (which are also the
long ones that benefit from shortening).

**In `/l` scope (migrate):**
- **leagues** `service_leagues.py`: `pickem_week` link (`:187`,
  `/leagues/<id>/results?week=N` or `/play` — the long UUID URLs); `league_invite`
  link (`:1694`, `https://waygerz.com/leagues`).
- **friends** `service_friends.py`: `friend_request` link (`:78`,
  `https://waygerz.com/friends`).

**Out of `/l` scope (stay bare `/c`, untracked):**
- **contests** `_wager_link` → `https://waygerz.com/c/<Bcode>` (all 5 wager
  templates).
- **webui** `inviteUrl(code)` → `https://waygerz.com/c/<code>` (shared league /
  friend "add me" links).

**Scope implication:** with `/c` excluded, `/l`'s value is mainly **shortening +
tracking the pick'em direct links** (long UUID paths) plus taps on
`friend_request` / `league_invite`. Bet-invite click-through (arguably the biggest
engagement signal) is intentionally **not** tracked — revisit if that changes.
(Unwired: `weekly_digest`. In-app `deep_link` excluded.)

Each in-scope emitter becomes: build the real target as today → `shorten(target,
kind)` → emit `https://waygerz.com/l/<code>`.

## Architecture
- **New `links` service** (mesh `links:8000`, group `platform` →
  `/v1/platform/links`). Owns the store, the internal `shorten`, and the
  click-log. A dedicated service (not folded into notifications) keeps the public
  redirect path independently scalable/reliable — it sits in front of *every*
  link tap.
- **`GET /l/<code>` — the redirect, served by the links service itself** (public,
  edge-reachable; the ALB `/l/*` rule points at the links target group). One
  handler does it all: look up the target, record a click, `302` to the target.
  webui is not in the path at all.
  - **Routing:** prod adds an ALB rule `/l/*` → links TG (precedent:
    `ROUTING_AUDIT_REMEDIATION.md` — all `/v1/*` groups already route ALB→TG
    directly). Local compose adds a `location /l/ { proxy_pass http://links:8000/…; }`
    block in `api/gateway/conf.d/default.conf` (today `:146` sends all non-`/api`
    to webui, so without it `/l` would wrongly hit webui locally). **No webui /
    `proxy.ts` change** — webui never sees `/l`.
  - **Cache + 302:** cache the immutable code→target **lookup** (Redis/in-memory)
    so a tap isn't a DB read; use **302, never 301** (301 is cached permanently by
    browsers and would skip the tracker on repeat taps). **Caching applies to the
    target lookup only — every tap still writes a click, even on a cache hit.**
  - **Defense (not a tight per-IP limit):** resolve is hit on *every legit tap*,
    and a viral link's taps can share one egress IP (carrier NAT / corp proxy), so
    a per-IP rate limit would throttle real users. Keep resolve **cheap +
    idempotent** and defend click integrity with **bot-UA / prefetch filtering**
    (below); the gateway's existing global cap is a coarse backstop only.
- **Store** (`links` schema):
  - `links`: `{ code (PK, base62 ~7-8 chars), target_path, kind (template_key/
    campaign), created_at, created_by?, expires_at? }`. `target_path` is stored
    as a **relative in-app path** (`/leagues/…`, `/friends`) and the redirect
    prepends the canonical origin — never store/redirect to an arbitrary external
    host, and never a `/c/<code>` (those aren't shortened).
  - `link_clicks`: `{ id, code, user_id?, at, ua?, ip? }` (raw events; roll up to
    per-code counts for cheap reads). Consider retention TTL (privacy + volume).
- **shorten (internal, mesh-only):** `POST /internal/shorten { target_path, kind }`
  → `{ code, url }` (`X-Internal-Token`). Called by the Flask emitter services,
  which ARE in the mesh. **Idempotent**: same (target_path, kind) reuses the
  existing code — one `/l` code per (target, kind), reused across all recipients,
  not one per send. (E.g. a league-week's `/leagues/<id>/results?week=N` +
  `pickem_week` = one shared code for that week's blast.)

## Attribution — how we know "who clicked"
- **v1: per-link code + session, done inside the links service.** The `GET /l`
  handler receives the `waygerz_access` cookie on the tap (same registrable
  domain) and links — flask-jwt-extended, shared secret,
  `locations=["cookies","headers"]` like every other service — decodes it to a
  `user_id` (optional) and records it on the click. No webui hop and no
  cookie-forwarding: because `/l` is served by links directly, the cookie arrives
  at links first-hand. A **logged-out** tap (common from SMS) is an **anonymous**
  click.
- **⚠️ Depends on the cookie's `SameSite`.** A tap from an external app is a
  top-level cross-site navigation: `SameSite=Lax` cookies ARE sent (→ attributed),
  `Strict` would NOT be. Auth defaults `JWT_COOKIE_SAMESITE=Lax` (`auth config.py`)
  — good; just confirm prod doesn't override it to `Strict`.
- **Click counts are directional engagement analytics, not billing/payout**, so
  their integrity isn't load-bearing: bot filtering + best-effort short-window
  dedup are enough; a determined actor rotating IP/UA could inflate a count, and
  that's acceptable.
- **Deferred: per-recipient codes** (a unique `/l` code per member per send) →
  exact identity even for logged-out SMS taps, at the cost of code volume. Only if
  SMS-tap-level identity becomes a real need.

## Failure & safety
- **shorten() is best-effort:** if the links service is unreachable when a
  notification is built, fall back to emitting the **direct** target URL — a link
  is never withheld because tracking is down. (shorten is server-to-server from a
  Flask service, which IS in the mesh → `http://links:8000/internal/shorten`,
  `X-Internal-Token`. Only *resolve* is public/edge-reachable, per Architecture.)
- **⚠️ `/l` is a new single point of failure for every *sent* link.** Once an `/l`
  SMS link is sent it can't fall back to the direct target, so **links must be HA**
  — today `/c/<code>` resolves client-side against the already-HA contests/leagues
  services with no links service in the path, so this is a real new dependency.
  (Direct-ALB removes the *drift* part of the first audit's concern — the tap is a
  north-south public-zone request — but the HA requirement stands.) A bad/expired
  code → `302 /` is sane (mirrors `/c`); a **transient** resolve failure → `302 /`
  **silently drops the user's real destination** — a degraded, not broken, regression
  to state explicitly.
- **Open-redirect guard:** only same-origin **relative** `target_path`s, validated
  **at shorten-time, in the links service (Python)** — not a JS check (shorten is
  Flask). Prefer an **allowlist** of known leading segments (`/leagues`,
  `/friends`; `/c/` is out of scope) over a blocklist; strip/reject control +
  whitespace chars
  (tab/newline); and still reject **protocol-relative (`//evil.com`)** and
  **backslash (`/\evil.com`)** forms, which normalize into off-site redirects once
  the origin is prepended.
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
1. **links service** — schema + migration, internal `shorten`, the public
   **`GET /l/<code>`** resolve+log+302 handler (links-side JWT attribution, cache
   the lookup, GET-only + bot filtering, always log), click-log + per-code rollup,
   shorten-time open-redirect validation (Python allowlist). Register in Service
   Connect (`links`, port `http`).
2. **Routing** — prod ALB rule `/l/*` → links TG; local gateway `location /l/`
   block. No webui/`proxy.ts` change.
3. **Migrate emitters** (each is a server-side Flask service that calls
   `shorten()` with a best-effort direct-link fallback):
   - leagues `pickem_week` + `league_invite` links;
   - friends `friend_request` link.
   (No client-side shorten needed — all in-scope emitters are server-side; `/c`
   emitters, incl. webui `inviteUrl`, are out of scope.)
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
  deep link. Universal Links / App Links must map the **`/l`** (and `/c`) path
  patterns to the app so an installed app intercepts the tap natively — which also
  means the association files `/.well-known/apple-app-site-association` and
  `assetlinks.json` (served by webui/gateway) must list `/l` and `/c`. Note for the
  mobile build; no work now.

## Cross-cutting
- **Routing:** prod adds ONE ALB rule `/l/*` → links TG (above the webui default);
  local compose adds ONE gateway `location /l/` block. No `proxy.ts` change — webui
  is never in the `/l` path. (The earlier "no gateway/ALB change" was for the
  rejected webui-handler design.)
- `web/lib/api-paths.ts` gains the `links` prefix (for the internal `shorten`
  callers / any `/v1/platform/links` admin reads).
- New service → one migration in the `links` schema. **shorten** stays internal
  (`X-Internal-Token`), reached by Flask emitter services over the mesh
  (`http://links:8000`). **`GET /l`** is the public edge surface (ALB → links).
  Register `links` in Service Connect (port `http`).
- Commit each edit; deploy only when told.

## Open decisions
- Dedicated `links` service (recommended) vs fold into `notifications`.
- Raw click events vs counter rollups from day one (leaning rollups + optional
  sampled raw for debugging).
- Given `/c` is out of scope, whether the remaining value (mainly shortening +
  tracking pick'em's long links) justifies a whole new service now, or whether it
  waits until there's more direct-link volume / a concrete analytics need.
