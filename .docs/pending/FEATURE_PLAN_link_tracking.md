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
fallback** so a notification link is never blocked.

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
  (`app/(public)/l/[code]/route.ts`), matching how `/c` is a public webui surface:
  it calls the links service (SSR, in-VPC via `API_INTERNAL_URL`) to resolve the
  target + record the click, then returns `NextResponse.redirect(target, 302)`.
  A Route Handler (not a page) — no render, just a fast redirect.
  - `proxy.ts`: add `/l` to `PUBLIC_PREFIXES` (alongside `/c`,`/terms`,`/privacy`).
  - Gateway/ALB: `/l/*` is non-`/api`, so it already routes to webui — **no
    gateway/ALB change** (same as `/c`).
- **Store** (`links` schema):
  - `links`: `{ code (PK, base62 ~7-8 chars), target_path, kind (template_key/
    campaign), created_at, created_by?, expires_at? }`. `target_path` is stored
    as a **relative path** (`/c/<code>`, `/leagues/…`) and the redirect prepends
    the canonical origin — never store/redirect to an arbitrary external host
    (open-redirect guard: only same-origin relative paths).
  - `link_clicks`: `{ id, code, user_id?, at, ua?, ip? }` (raw events; roll up to
    per-code counts for cheap reads). Consider retention TTL (privacy + volume).
- **Internal API:** `POST /internal/shorten { target_path, kind }` →
  `{ code, url }` (`X-Internal-Token`, mesh-only). **Idempotent**: same
  (target_path, kind) reuses the existing code (a bet's `/c/<Bcode>` gets one `/l`
  code for its life, not one per send).
- **Resolve+click:** `POST /internal/resolve { code, user_id?, ua?, ip? }` →
  `{ target_path }` and records the click. (Called by the `/l` route handler.)

## Attribution — how we know "who clicked"
- **v1: per-link code + session.** The `/l` route handler reads the
  `waygerz_access` cookie → if present, resolves the viewer's `user_id` and stores
  it on the click; a **logged-out** tap (common from SMS) is an **anonymous**
  click. Tiny footprint, scales, and most taps that matter (in-app/push) are
  already authenticated.
- **Deferred: per-recipient codes** (a unique `/l` code per member per send) →
  exact identity even for logged-out SMS taps, at the cost of code volume. Only if
  SMS-tap-level identity becomes a real need.

## Failure & safety
- **shorten() is best-effort:** if the links service is unreachable when a
  notification is built, fall back to emitting the **direct** target URL — a link
  is never withheld because tracking is down.
- **Resolve availability:** `/l` is in the tap path for every link, so the links
  service must be highly available; a resolve miss/error should still 302 to a
  safe default (e.g. `/`) rather than error the user.
- **Open-redirect guard:** only same-origin relative `target_path`s are stored and
  redirected to; never redirect to an attacker-supplied absolute URL.
- **Privacy:** click logs tie a person to a tap — keep them internal, set a
  retention window, and don't expose raw logs to other users.

## Migrating ALL links (sequence)
1. **links service** — schema + migration, `shorten`/`resolve` internal endpoints,
   click-log, per-code count rollup. Register in Service Connect (`links`, port
   `http`).
2. **`/l` route handler** in webui + `proxy.ts` PUBLIC_PREFIX + `API_INTERNAL_URL`
   wiring.
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

## Mobile
- Native apps (Flutter, planned): `/l` links open the browser → 302 → the target
  deep link. Universal Links / App Links config must map **`/l`** (and `/c`) to the
  app so a tap opens natively. Note for the mobile build; no work now.

## Cross-cutting
- No gateway/ALB change (`/l` is non-`/api`, served by webui like `/c`).
- `web/lib/api-paths.ts` gains the `links` prefix; `proxy.ts` PUBLIC_PREFIXES gains
  `/l`.
- New service → one migration in the `links` schema; internal endpoints off the
  gateway (`X-Internal-Token`), reached over the mesh (`http://links:8000`) — never
  the ALB form (private-zone IP drift).
- Commit each edit; deploy only when told.

## Open decisions
- Dedicated `links` service (recommended) vs fold into `notifications`.
- Raw click events vs counter rollups from day one (leaning rollups + optional
  sampled raw for debugging).
- Whether shared invite links (`inviteUrl`) shorten client-side (needs a public
  `/api` shorten, rate-limited) or only server-issued links shorten in v1.
