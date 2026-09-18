# Mobile Parity Plan — bring the Flutter app up to webui

**Status:** planning (not started) · **Created:** 2026-09-18
**Scope:** `mobile/` (Flutter, iOS + Android) → feature parity with `web/` (Next.js).
**Target state = the current webui.** This plan is derived from a full audit of
both surfaces (2026-09-18).

---

## 1. Why / goal

webui is a full product; `mobile/` is a read-mostly scaffold (19 Dart files).
The API transport + phone-OTP auth are solid, but **the two core actions of the
product have no UI** — submitting Pick'em picks and proposing H2H bets — and two
entire domains (Friends, Messaging) plus the sports/events browser don't exist.

The bar: a mobile user can do everything a web user can, using the **same
`/v1/...` backend** (bearer tokens, `X-Client-Type: mobile`). No backend changes
are expected — every capability below already has a live endpoint the web client
exercises. Where mobile needs something the web client gets "for free" (SSE,
media presign, deep-link resume), that's a client build, not a server change.

## 2. Current state (audit summary)

**Solid / reusable:**
- `api/api_client.dart` — bearer auth, `X-Client-Type: mobile`, single-flight 401
  refresh, device-UUID. This is the reusable core; every new client extends it.
- `auth/` — OTP start/verify/complete, secure token storage, bootstrap. Done.
- Existing clients: `auth`, `leagues` (incl. unused `submitPicks`), `wagers`
  (incl. unused `propose`/cancel-handshake), `wallet`, `notifications`.

**Partial (view-only, write path unwired):**
- Leagues/Pick'em — list, detail, standings, activate, **view-only picks**.
- H2H Bets — list + accept/decline/cancel; **no propose**.
- Notifications — feed list only.
- Wallet — balance only, no ledger.
- Account — read-only name/phone + logout.

**Missing entirely:**
- Friends, Messaging (no client, model, or screen).
- Sports/events browser (no ingestor client) — **blocks picks & bet proposing.**
- Media resolution (avatars/logos never become images).
- Deep-link handling (`/c/<code>`, notification `deepLink`).
- FCM push (scaffolded, Firebase not initialized → off).

See §6 for the per-domain checklist used as acceptance criteria.

## 3. Architecture principles (how we build, to match web)

1. **API layer is the contract.** Each web `lib/*.ts` client maps 1:1 to a Dart
   `api/*_api.dart`. Mirror method names so parity is auditable
   (`leaguesApi.submitPicks` ↔ `LeaguesApi.submitPicks`). `config.dart` already
   lists all 10 path prefixes; wire the 5 unused ones.
2. **Models before screens.** `models.dart` currently has 8 entities; every new
   domain needs its models first (see per-phase "Models" lines). Keep them dumb
   data classes with `fromJson`.
3. **State management:** stay with the existing `provider`/`ChangeNotifier`
   approach the auth layer uses — do NOT introduce a second paradigm. One
   controller per domain that owns its API + cache + loading/error state,
   surfaced to screens. (Web uses TanStack Query cache invalidation; the Dart
   analogue is controllers notifying listeners after a mutation.)
4. **Navigation:** the 4-tab shell (`home_screen.dart`) maps to web's BottomNav.
   Web tabs are Leagues / Bets / Alerts / Messages / Profile — mobile is missing
   **Messages** as a tab and unread badges on Alerts/Messages. Add a router that
   can push detail routes AND be driven by deep links (§Phase 0).
5. **Real-time:** web uses `EventSource` (SSE) for the message stream. Flutter
   has no built-in EventSource — use a streamed `http` GET that parses `data:`
   lines, exposed as a Dart `Stream`, reconnect-on-drop. Scoped to Messaging.
6. **Media pipeline:** mirror web's presign → S3 PUT → complete, and a
   display-key → signed-URL resolver with caching. Needed for avatars, league
   logos, and (later) message/comment images.
7. **Deep links:** register `/c/<code>` + `waygerz://` handling; persist a
   pending link across the login round-trip exactly like web's `pending-link.ts`
   + `?next=`.
8. **No build on this host.** Dart is written here; `flutter analyze`/`build`/
   `run` happen on the developer's machine. Keep changes analyzer-clean by
   inspection; note any assumptions that need a real build to confirm.

## 4. Cross-cutting foundations — **Phase 0 (unblock everything)**

Nothing in the core loop works without these; do them first.

- **Ingestor client** (`api/ingestor_api.dart`) + models (`Sport`, `SportLeague`,
  `Team`, `Event`, `EventOdds`). Mirror web `ingestor.ts`: `fetchSports`,
  `fetchLeagues`, `fetchTeams`, `fetchLeagueEvents`, `fetchEvent`,
  `fetchEventOdds`, `fetchUpcomingEvents`, `fetchPeriodEvents`. **This is the
  hard blocker** — without an events board there is nothing to pick or bet on.
- **Media resolution** (`api/media_api.dart`): `resolve(displayKey) → signedUrl`
  with an in-memory cache; upgrade `LeagueAvatar`/profile to render real images.
  (Full upload pipeline can wait for Account phase; resolution is needed now for
  logos/avatars everywhere.)
- **Deep-link + routing**: a `Router`/`GoRouter`-style map, a `PendingLink`
  store (mirror `pending-link.ts`), and handlers for `/c/<code>`
  (`leaguesApi.resolveCode`/`actOnCode` already exist) and notification
  `deepLink`. Post-login resume.
- **Navigation shell fixes**: add the **Messages** tab; add unread badges on
  Alerts + Messages (APIs `unreadCount()` already exist, currently unused).

## 5. Phased build

### Phase 1 — Core product loop (the reason the app exists)
- **Pick'em pick submission** on `league_detail_screen` (or a new
  `pick_slate_screen`):
  - Period picker (`periods()` — fetched but unused today).
  - Event slate for the period (`fetchPeriodEvents`), side selection per game
    (home/away), tiebreaker total entry.
  - Submit via `submitPicks` (client method exists, never called). Optimistic
    update + re-fetch. Respect lock/kickoff state.
  - Models: extend `Pick`, add `Event` (from Phase 0).
- **H2H propose flow** (new `propose_wager_screen`, entry from league Upcoming /
  Sports and from a bet's league):
  - Two proposer UIs mirroring web `play`: (a) field/odds sports — moneyline /
    spread / total via `fetchEventOdds`; (b) 1v1/team sports — pick two
    competitors. Treat/brag bets (beer/shot, 0-credit).
  - Opponent selector (from league members / friends).
  - Submit via `propose` (exists, never called).
- **Acceptance:** a user can complete a full week of picks and propose+receive a
  bet end-to-end on mobile.

### Phase 2 — Social + notifications parity
- **Friends** (new `api/friends_api.dart`, models, `friends_screen.dart`):
  list, incoming/outgoing requests (accept/decline), add-by-code, remove,
  personal friend link + share sheet, view-user profile dialog (favorites + H2H
  record).
- **Notifications parity** on `notifications_screen`: tap-through via `deepLink`
  (Phase 0 router), `markRead` (single + all), unread badge, inline accept/
  decline routed by ref type (wager `actOnCode`, friend accept/decline, league
  `acceptInvite`), timestamps, preferences screen (`preferences`/
  `updatePreferences` — the per-category SMS/in-app toggles from web's
  `notifications-card`).

### Phase 3 — Messaging (largest single build; real-time)
- New `api/messaging_api.dart` + models (`Conversation`, `Message`).
- `conversations_screen`: direct + league lists, unread counts, mark-all-read,
  open/create league conversation.
- `conversation_screen`: `listMessages`, `send`, **SSE stream** (§3.5), typing
  indicator (`sendTyping`), read receipts (`markRead`), and inline open/accepted
  **bet cards** with live-refreshing scores (`fetchEvent`).

### Phase 4 — Completeness & polish
- **Create league** + commissioner tools (update name/logo/rules incl.
  `who_can_propose`, advance/regenerate periods, archive, notify-week, member
  roles/remove/transfer).
- **League feed**: post announcement, threaded comments (+replies, delete), 7
  emoji reactions, reactors — needs `api/comments_api.dart` + reactions taxonomy.
- **Full bet lifecycle**: counter-offer, undecline, two-sided cancel handshake
  (request/approve/reject), confirm/settle, cross-league Bets view with status
  filters + live scores.
- **Wallet ledger** (`transactions()` — exists, unused).
- **Account**: edit display name, avatar upload (image→webp→presign→S3→
  `setAvatar`, re-select recent), favorite teams (max 6, `TeamPicker`), notif
  prefs, theme color/surface, delete-account (409 owns-leagues handling).
- **Auth hardening**: SMS-consent gate for new numbers (must precede OTP send),
  terms/privacy acceptance, resend code, phone formatting.
- **Push**: run `flutterfire configure`, initialize Firebase in `main.dart`,
  call `PushService.register()`, handle notification taps into the deep-link
  router.

## 6. Per-domain acceptance checklist (parity definition)

- [ ] **Auth** — OTP + consent gate + terms + deep-link resume + delete-account
- [ ] **Leagues/Pick'em** — create, activate, archive, leave, commissioner mgmt,
      feed+comments+reactions, **submit picks**, periods, results, member confirm
- [ ] **H2H Bets** — **propose** (odds + 1v1/treats), counter, accept/decline/
      undecline, 2-sided cancel, confirm/settle, cross-league filters, live scores
- [ ] **Friends** — list, requests, add-by-code, remove, friend link, profile
- [ ] **Messaging** — conv list, DMs, SSE, typing, read receipts, badges, bet cards
- [ ] **Notifications** — feed, badge, mark-read, tap-through, inline actions, prefs
- [ ] **Wallet** — balance + ledger
- [ ] **Sports** — browse sports→leagues→events, ESPN detail, odds/upcoming
- [ ] **Account** — edit name, avatar, favorite teams, prefs, theme, delete
- [ ] **Sharing/Deep-links** — `/c/<code>` resolver, invite links, share, resume
- [ ] **Push** — FCM on, taps route via deep-link

## 7. Risks & open questions

- **SSE in Flutter** — no native EventSource; streamed-response parser is the
  plan. Needs a real device/build to validate reconnect behavior (can't build
  here). Flag for developer-machine verification.
- **ESPN-specific detail screens** — web has `espn.ts` + `isEspnSport` guards.
  Confirm which sports need the ESPN detail vs. the generic ingestor path before
  building `sports/` detail.
- **Native project not generated** — `mobile/` ships only `lib/` + `pubspec`.
  `flutter create --org com.waygerz ...` must be run once on a build machine
  before any of this runs (documented in `mobile/README.md`).
- **Push requires Firebase project config** (`flutterfire configure`) — a
  one-time setup outside this repo; Phase 4 is blocked on it.
- **Deep-link scheme** — confirm the iOS/Android universal-link + custom-scheme
  registration story (associated domains / intent filters) before Phase 0 router.
- **No build on this host (2GB)** — all Dart is analyzer-clean by inspection;
  every phase needs a `flutter analyze`/`run` pass on the developer's machine.

## 8. Sequencing summary

```
Phase 0  Foundations   ingestor client · media resolve · deep-link router · shell tabs/badges
Phase 1  Core loop     submit picks · propose bet            ← unblocks the product
Phase 2  Social        friends · notifications parity
Phase 3  Messaging     conv list · DM thread · SSE/typing/receipts · bet cards
Phase 4  Completeness  create-league+commish · feed/comments/reactions · full bet lifecycle
                       · wallet ledger · account editing · auth hardening · FCM push
```

Phase 0 is the hard prerequisite; Phase 1 is the highest-value slice. Phases 2–4
can be reordered by product priority once the core loop lands.
