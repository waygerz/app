# Feature plan: `/c/R` link shortening & click tracking (in `notifications`)

Planned 2026-09-15 (revised after 3 audits + a design call). **Goal: A + B.**
- **A — know who *opened* a pick'em notification** (in-app + push engagement).
- **B — deliver pick'em links over SMS short + click-tracked.**

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
not change**. The rule is purely structural: shorten the `link` context var **iff
its target is a same-origin path that is NOT under `/c/`**. That set is exactly:
- **pick'em** `pickem_week` → `/leagues/<uuid>/results?week=N` or `/play` (the long
  URLs — the real shortening win, and the primary tracking target),
- `league_invite` → `/leagues`, `friend_request` → `/friends` (tracked; already
  short so no length gain — bare-list targets, weak signal, but free to include).

**Excluded (left bare):** every `/c/B|L|F` link (wager links, shared invite links)
— already short, own resolver, and re-wrapping a `/c` in a `/c/R` is explicitly
disallowed by the shorten rule (target under `/c/` → skip). So `/c/R` never points
at another `/c`.

## Architecture (all in `notifications`)
- **Store** (`notifications` schema, one migration):
  - `redirect_links`: `{ code (PK, base62 ~7 chars, no ambiguous chars, always
    minted with a leading `R`), target_path (same-origin relative), kind
    (template_key), created_at }`. **Idempotent** per `(target_path, kind)` — one
    code reused across all recipients of a send (not per recipient).
  - `link_clicks`: append a row / bump a rollup on each engagement, from **both**
    channels: `{ kind, user_id?, source ('link' | 'inapp'), code?, at, ua?, ip? }`.
    Prefer per-(code|kind, user) **counter rollups** over unbounded raw rows.
- **B — shorten at send:** in `notify()`/`render()`, before substituting
  `{{link}}`, if the target is a shortenable path (rule above) call an internal
  `shorten(target, kind)` → `/c/R<code>` and substitute. **Best-effort**: if
  minting fails, emit the direct link (never withhold). Emitters untouched.
- **B — the redirect:** **`GET /c/R<code>`** on notifications (public, edge). One
  handler: look up target (cached — immutable), record a `link` click (attribute
  via the `Lax` `waygerz_access` cookie, decoded by flask-jwt-extended like every
  service), **`302`** to the target. Use **302, never 301** (301 is cached
  forever and skips the tracker on repeat taps). **Cache the target lookup only —
  every tap still logs a click.**
- **A — in-app/push open tracking:** the notifications feed already marks a
  notification read on tap (`openItem` → `markRead` + `router.push(deep_link)`).
  Add a lightweight click write there (`source='inapp'`, `kind=template_key`,
  `user`) so an in-app/push open lands in the **same `link_clicks` store**. No
  `/c/R` for in-app taps — they use the client `deep_link`, not a web redirect.
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
  `/c/R` would wrongly hit webui). B/L/F `/c/*` still → webui.
- **No `proxy.ts` change** — webui never serves `/c/R`. No new gateway/ALB *service*,
  just the one path rule + one local location.

## Safety & failure
- **Open-redirect guard (in notifications, Python, at shorten-time):** only
  same-origin **relative** targets; **allowlist** the known leading segments
  (`/leagues`, `/friends`); reject absolute, **protocol-relative (`//evil`)** and
  **backslash (`/\evil`)** forms, and strip/reject control + whitespace chars. And
  by construction never a `/c/...` target (the shorten rule skips those).
- **`/c/R` is a new dependency in the tap path** for every *sent* SMS link — once
  sent it can't fall back to the direct target — so notifications must stay HA (it
  already is; it's on the send path today). A bad/expired code → `302 /`; a
  *transient* resolve failure → `302 /` silently drops the destination (degraded,
  not broken).
- **Bot / link-preview inflation:** SMS/iMessage/Slack/scanners prefetch URLs.
  Count **GET only** (ignore HEAD), filter known bot UAs, honor `Purpose:
  prefetch`/`X-Purpose`, best-effort dedup per (code, ip/ua) short-window.
- **Click counts are directional engagement analytics, not billing** — integrity
  isn't load-bearing, so bot filtering + best-effort dedup are enough.
- **No Twilio link shortening** — our `/c/R` handles SMS; keep Twilio's feature OFF.
- **SameSite:** attribution needs the auth cookie on the top-level cross-site GET;
  auth defaults `JWT_COOKIE_SAMESITE=Lax` (sent on nav) — confirm prod isn't
  `Strict`.
- **Privacy:** click logs tie user+IP+UA to a tap — internal only, retention
  window, and **disclose click tracking in the privacy policy** (open counsel item).

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
1. **notifications store** — migration: `redirect_links` + `link_clicks` (rollup
   counters). Base62 code-gen helper (leading `R`, no ambiguous chars, unique).
2. **shorten at send** — in `notify()`/`render()`, shorten a `{{link}}` whose
   target is a non-`/c` same-origin path (allowlist-validated), best-effort with
   direct-link fallback. (Emitters unchanged.)
3. **`GET /c/R<code>`** handler on notifications — resolve (cached) + log click
   (Lax-cookie attribution) + 302; GET-only + bot/prefetch filtering.
4. **Routing** — prod ALB `/c/R*` → notifications TG; local gateway `location /c/R`.
5. **A — in-app/push open tracking** — write a `source='inapp'` click on the feed's
   existing open/markRead path, keyed by `template_key` + user.
6. **Unified read** — an internal/admin query (later a small dashboard) over
   `link_clicks` grouped by `kind` × source.

Deploy order when built: notifications (migration) → the ALB `/c/R*` rule → webui
(only if the feed-tap-tracking touches webui, which it does for step 5). Commit
each edit; deploy only when told.

## Open decisions
- **Emitter-side shorten vs send-time shorten** — plan assumes **send-time** in
  notifications (zero emitter changes). Only revisit if a link needs shortening
  outside a notification (e.g. a shared/browser-issued link) — deferred.
- **Raw click events vs counter rollups** — leaning rollups from day one, optional
  sampled raw for debugging.
- **Per-send codes** (campaign-level attribution) — deferred; per-`(target,kind)`
  is enough for engagement.
