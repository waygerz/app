# Unified Invite Codes — Design

Consolidate the two share-link routes (`/invite?code=` for leagues, `/add-friend?u=`
for friends) into **one deep-linkable route `/j/<code>`** that works on web today
and iOS/Android later.

## Decisions (locked)

1. **Per-service codes, shared response contract.** Each owning service (leagues,
   friends) keeps its own code storage and exposes `resolve` + `act` endpoints that
   return an identical JSON shape. The code's **type prefix** tells the client which
   service to call. No new microservice; no new server-to-server internal calls.
2. **Per-code lifetime flag.** Every code carries `single_use` (+ optional
   `expires_at`). Reusable share links stay reusable (one league code the whole
   group joins with; a personal friend link); single-use codes are stamped
   `consumed_at` on accept/decline and can't be replayed.
3. **Universal Links / App Links now, deferred deep linking later.** Ship
   `.well-known` association files for `/j/*` with the apps; deferred
   resolve-after-install is a fast-follow.

## Code format

- Alphabet reuses the existing unambiguous set: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
  (no `I/O/0/1`).
- **First char = type marker**, so a client routes by prefix with no lookup:
  - `L` → league invite  → call the **leagues** service
  - `F` → friend invite  → call the **friends** service
- Body = 6 random chars → `32^6 ≈ 1.07 B` per type. e.g. `L4K9QX7`, `F7M2PJH`.
- **URL carries the bare code**: `/j/L4K9QX7` (path param, not query — Universal/App
  Link matching is path-based). UI may render it grouped (`L4K9-QX7`) for typing;
  dashes are stripped on input.
- **Back-compat:** the legacy league `join_code` (`WAYG-XXXX`) still resolves — the
  leagues resolver accepts both the new `L…` codes and old `WAYG-…` codes.

## Shared response contract

`GET /v1/{group}/{service}/j/<code>` — resolve (JWT **optional**, so signed-out
users see the preview):

```json
{
  "type": "league" | "friend",
  "code": "L4K9QX7",
  "target_id": "<league_id | user_id>",
  "state": "ok" | "invalid" | "expired" | "consumed",
  "single_use": false,
  "viewer": {
    "authenticated": true,
    "relationship": "none|member|left|friends|pending_in|pending_out|self"
  },
  "preview": { "...type-specific display fields (name, avatar, member_count, ...)" },
  "actions": ["join"] | ["accept", "decline"] | []
}
```

`POST /v1/{group}/{service}/j/<code>/act` with `{ "action": "join|accept|decline" }`
— performs the action, stamps `consumed_at` when `single_use`, and returns
`{ "type", "target_id" }` so a **native client can navigate to its own screen**
(web maps it to a redirect):

- league `join`   → `/leagues/{target_id}`
- friend `accept` → `/friends`
- any `decline`   → `/` (dashboard)

## Backend changes

### friends service (`api/friends/`) — gains a real code table

Today the friend link embeds a **raw user UUID** (`?u=<uuid>`) — a privacy leak and
no lifetime control. Replace with a code:

- New table `friend_invite_codes`: `code` (unique, indexed), `owner_id` (the sender;
  accepting befriends this user), `single_use`, `expires_at`, `consumed_at`,
  `created_at`.
- Each user has one **persistent reusable** personal code (`single_use=false`),
  generated lazily on first share — mirrors how a league owns its `join_code`.
- Endpoints: `GET /j/<code>` (resolve → uniform shape; relationship computed from
  `friendships`), `POST /j/<code>/act` (accept → create/accept friendship, consume if
  single_use; decline → delete pending row, consume). Reuse existing
  `service_friends` logic underneath.

### leagues service (`api/leagues/`) — add a codes table alongside `join_code`

- New table `league_invite_codes`: `code` (unique), `league_id`, `created_by`,
  `single_use`, `expires_at`, `consumed_at`, `created_at`.
- Migrate each league's existing reusable `join_code` in as a `single_use=false`
  row; keep the `leagues.join_code` column as the denormalized back-compat pointer.
- One-time league invites become new `single_use=true` rows.
- Endpoints: `GET /j/<code>` and `POST /j/<code>/act` wrapping the existing
  `preview` / `join_by_code` logic in the uniform contract + consumption. Old
  `preview` / `join` stay for back-compat.

### gateway (`api/gateway/conf.d/default.conf`)

- The `/api/v1/social/friends` and `/api/v1/gameplay/leagues` prefix locations
  already cover the new `/j/...` sub-paths — **no gateway route change** for the API.
- **Serve the `.well-known` files** (see Mobile) — non-`/api` traffic already
  proxies to `webui:3000`, so Next serving them from `public/.well-known/` is enough;
  verify content-type `application/json` and **no redirect**.

## webui changes

- **New route** `app/(public)/j/[code]/page.tsx`: read `params.code`, strip dashes,
  pick service by prefix, call resolve, render the existing league-preview or
  friend-preview card, and Accept/Decline → `act` → redirect from the returned
  `{type, target_id}`.
- **Redirect shims:** keep `/invite` and `/add-friend` as thin redirects to
  `/j/<code>` so links already shared in the wild keep working. (`/add-friend?u=` has
  no code — the shim resolves the user's current code, or we keep the raw-uuid
  resolver path alive during transition.)
- **`lib/invites.ts`** (new): `resolveCode(code)` + `actOnCode(code, action)` — the
  single client for both types (prefix switch lives here, one place).
- **`lib/invite-links.ts`** (new): one builder for share URLs — fixes today's split
  where `lib/friends.ts` centralizes its URL but the league URL is inlined in
  `leagues/[id]/layout.tsx`. Both share buttons call this.
- **`lib/pending-link.ts`:** generalize the stash to a single `{ code }` item and
  match `/j/` (drop the two hardcoded route strings).
- **`proxy.ts`:** add `/j` to `PUBLIC_PREFIXES` (keep the old two during transition).

## Mobile (Flutter, iOS + Android)

- **iOS Universal Links:** serve `/.well-known/apple-app-site-association` (JSON, no
  extension, `application/json`, no redirect) registering path `/j/*` for the app's
  Team ID + bundle ID. Add the Associated Domain in the app.
- **Android App Links:** serve `/.well-known/assetlinks.json` with the app's package
  name + SHA-256 signing-cert fingerprint; add the `/j/*` intent filter.
  > ⚠️ **Proxy gotcha:** confirm `/.well-known/*` is NOT bounced to `/login` by
  > `proxy.ts` — the matcher currently excludes paths containing a `.` (the leading
  > dot in `.well-known` covers it), but verify with a signed-out `curl`.
- Installed app opens the code natively → `resolveCode` → native preview → `act` →
  native navigation. No app → the web `/j/<code>` page works, with a smart
  "Open in app / Get the app" banner.
- **App IDs are TBD** until the Flutter apps exist — the `.well-known` files land in
  Phase 2 with real Team ID / package / fingerprint values.

## Phasing

**Phase 1 — web + backend (ship at launch)**
- [ ] `friend_invite_codes` table + resolve/act endpoints (friends)
- [ ] `league_invite_codes` table + migration of existing `join_code` + resolve/act (leagues)
- [ ] `lib/invites.ts`, `lib/invite-links.ts`, generalized `pending-link.ts`
- [ ] `/j/[code]` route + `/invite` & `/add-friend` redirect shims
- [ ] `proxy.ts` public prefix
- [ ] Point both share buttons at the new builder

**Phase 2 — mobile-ready (with the apps)**
- [ ] `.well-known/apple-app-site-association` + `assetlinks.json` (real app IDs)
- [ ] Smart install banner on the web `/j` page
- [ ] Flutter deep-link handling (Associated Domains / intent filters → resolve → act)

**Phase 3 — fast-follow**
- [ ] Deferred deep linking (resolve a code after install-from-store)
- [ ] UI to mint single-use / expiring invites
- [ ] Retire the legacy `/invite` + `/add-friend` routes once traffic drains

## Open questions to settle before Phase 1

- **Friend "add me" link** is inherently reusable (`single_use=false`, one per user).
  Confirm we also want single-use friend invites, or reusable-only for friends.
- **Old `/add-friend?u=<uuid>` links already shared:** keep the raw-uuid resolver
  alive indefinitely, or sunset with the shim in Phase 3?
