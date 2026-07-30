# Unified Invite Codes — Design

Consolidate the two share-link routes (`/invite?code=` for leagues, `/add-friend?u=`
for friends) into **one deep-linkable route `/j/<code>`** that works on web today
and iOS/Android later.

> **Dev-stage cleanup:** no production invite data to preserve, so we **remove all
> old share-link code outright** — no redirect shims, no back-compat resolvers. New
> tables are still created via the normal per-service `flask db migrate` (that's how
> the schema lands in every env), but the revisions may freely drop the old
> columns/tables with no data-preservation logic.

## Decisions (locked)

1. **Per-service codes, shared response contract.** Each owning service (leagues,
   friends) keeps its own code storage and exposes `resolve` + `act` endpoints that
   return an identical JSON shape. The code's **type prefix** tells the client which
   service to call. No new microservice; no new server-to-server internal calls.
2. **Per-code lifetime flag.** Every code carries `single_use` (+ optional
   `expires_at`). Reusable share links stay reusable; single-use codes are stamped
   `consumed_at` on accept/decline and can't be replayed.
3. **Friend links are reusable** and befriend the code owner. On resolve, if the
   viewer is **already friends**, show a message + a **Dashboard** button (no action).
4. **Universal Links / App Links now, deferred deep linking later.** Ship
   `.well-known` association files for `/j/*` with the apps; deferred
   resolve-after-install is a fast-follow.

## Scope note — two different "league invite" features

- **Shareable link** (reusable `join_code` + `invite_token` on the `leagues` table)
  — **replaced** by `/j/L…`. All old code removed.
- **Targeted invite inbox** (`league_invites` rows; a commissioner invites specific
  friends by user-id, who see them in the "Invites (N)" list on `/` and accept via
  `POST /<league_id>/join`) — **out of scope, kept as-is**. It is not a shareable
  link.

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
- No legacy-format acceptance — the old `WAYG-XXXX` codes are removed with everything
  else.

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

**`actions: []` (nothing to do)** covers: already a member, already friends, `self`,
`expired`, `consumed`. The client shows the matching message + a **Dashboard** button.

## Backend changes

### friends service (`api/friends/`) — gains a real code table

Today the friend link embeds a **raw user UUID** (`?u=<uuid>`) — a privacy leak and
no lifetime control. Replace with a code:

- New table `friend_invite_codes`: `code` (unique, indexed), `owner_id` (accepting
  befriends this user), `single_use` (default **false** — friend links are reusable),
  `expires_at`, `consumed_at`, `created_at`.
- Each user has one **persistent reusable** personal code, generated lazily on first
  share — mirrors how a league owns its `join_code`.
- Endpoints: `GET /j/<code>` (resolve; relationship computed from `friendships` — if
  `friends`, return `actions: []`), `POST /j/<code>/act` (accept → create/accept
  friendship; decline → delete pending row; consume if single_use). Reuse existing
  `service_friends` logic underneath.
- **Remove:** the raw-uuid `GET /users/<id>/invite-preview` endpoint and any code path
  that keys friend invites on a bare user-id.

### leagues service (`api/leagues/`) — replace join_code with a codes table

- New table `league_invite_codes`: `code` (unique), `league_id`, `created_by`,
  `single_use`, `expires_at`, `consumed_at`, `created_at`. A league's default
  reusable code is a `single_use=false` row created at league creation; one-time
  invites are `single_use=true` rows.
- Endpoints: `GET /j/<code>` and `POST /j/<code>/act` in the uniform contract, built
  on the existing `preview` / `join_by_code` logic.
- **Remove:** the `leagues.join_code` and `leagues.invite_token` columns, the old
  `GET /preview` and `POST /join` endpoints, and the `?code` / `?invite_token`
  handling. (The targeted `league_invites` inbox stays — see scope note.)

### gateway (`api/gateway/conf.d/default.conf`)

- The `/api/v1/social/friends` and `/api/v1/gameplay/leagues` prefix locations
  already cover the new `/j/...` sub-paths — **no gateway route change** for the API.
- **Serve the `.well-known` files** (see Mobile) — non-`/api` traffic already
  proxies to `webui:3000`, so Next serving them from `public/.well-known/` is enough;
  verify content-type `application/json` and **no redirect**.

## webui changes

- **New route** `app/(public)/j/[code]/page.tsx`: read `params.code`, strip dashes,
  pick service by prefix, call resolve, render the league- or friend-preview card,
  and Accept/Decline → `act` → redirect from the returned `{type, target_id}`. The
  already-friends / already-member / expired / consumed states render a message + a
  **Dashboard** button.
- **Delete** `app/(public)/invite/` and `app/(public)/add-friend/` entirely (no
  shims).
- **`lib/invites.ts`** (new): `resolveCode(code)` + `actOnCode(code, action)` — the
  single client for both types (prefix switch lives here, one place).
- **`lib/invite-links.ts`** (new): one builder for share URLs — replaces today's
  split (`lib/friends.ts` inline URL + the league URL inlined in
  `leagues/[id]/layout.tsx`). Both share buttons call this.
- **`lib/pending-link.ts`:** collapse the stash to a single `{ code }` item and match
  `/j/` (drop the `/invite` + `/add-friend` route strings).
- **`proxy.ts`:** replace the `/invite` + `/add-friend` public prefixes with `/j`.
- **Remove:** `friendsApi.invitePreview` / `inviteLink`, `leaguesApi.preview` / `join`
  and their callers, once migrated to `lib/invites.ts`.

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

**Phase 1 — web + backend (ship at launch)** ✅ built (2026-07-30), pending deploy
- [x] `friend_invite_codes` table + resolve/act endpoints (friends); remove raw-uuid endpoint
- [x] `league_invite_codes` table + resolve/act (leagues); drop `join_code`/`invite_token` + old `preview`/`join`
- [x] `lib/invites.ts` (resolveCode/actOnCode/myFriendCode/inviteUrl), collapsed `pending-link.ts`
- [x] `/j/[code]` route; delete `/invite` + `/add-friend`
- [x] `proxy.ts` public prefix → `/j`
- [x] Point both share buttons (league layout, friends page) at the new builder

**Phase 2 — mobile-ready (with the apps)**
- [ ] `.well-known/apple-app-site-association` + `assetlinks.json` (real app IDs)
- [ ] Smart install banner on the web `/j` page
- [ ] Flutter deep-link handling (Associated Domains / intent filters → resolve → act)

**Phase 3 — fast-follow**
- [ ] Deferred deep linking (resolve a code after install-from-store)
- [ ] UI to mint single-use / expiring invites
