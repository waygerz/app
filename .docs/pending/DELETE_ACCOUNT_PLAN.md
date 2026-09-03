# Self-serve "Delete my account" — implementation plan

Status: **BUILT 2026-09-03 (not yet deployed).** All backend endpoints + the auth
orchestrator + the webui danger-zone card are written and pass `py_compile` /
eslint / bounded `tsc`. NOT run against a live DB yet (pytest can't run on the 2 GB
host) and NOT deployed. Remaining: per-service pytest in CI, then deploy all 9
services + auth + webui. Design confirmed 2026-09-03. Complements the
manual admin cleanup (`.scripts/delete_user.sh` + `.docs/pending/MEMBERS_CLEANUP.md`),
which is a blunt hard-delete cascade for test accounts and is NOT what real users
get.

## Decisions (confirmed)

1. **Anonymize + preserve shared history** — scrub identity + delete private
   data, but keep records other members rely on (settled bets, chat, comments),
   shown as "Deleted user". This is what app-store / GDPR "delete account"
   expects.
2. **Block on owned leagues** — refuse if the user commissions any non-archived
   league; make them transfer/close first. Never silently orphan or dissolve a
   league other people use.
3. **Void + refund live bets** — cancel OPEN and `_void_refund` ACCEPTED wagers
   so no counterparty's stake is stuck. Settled/completed bets stay as history.

## User-id footprint (source of truth for the purge)

Gathered by direct model read on 2026-09-03.

- **auth**: `users.id` (account), `sessions.user_uuid`
- **users**: `profiles.user_id` (PK), `favorite_teams.user_id`
- **wallet**: `balances.user_id` (PK part; account = `league:{id}`),
  `transactions.user_id` (append-only ledger)
- **contests**: `wagers.proposer_id` / `acceptor_id` / `winner_user_id`,
  `wager_invite_codes.created_by`
- **leagues**: `leagues.commissioner_id` ⚠️(owner), `league_members.user_id`,
  `picks.user_id`, `pick_confirmations.user_id`, `feed.author_id` (nullable),
  `feed_reads.user_id`, `invite_codes.created_by`,
  **`league_invites.inviter_id` / `invitee_id`** (in-app invite inbox — separate
  table from invite_codes)
- **friends**: `friendships.requester_id` / `addressee_id`, `invite_codes.owner_id`
- **messaging**: `conversations.direct_key` (embeds the id, `"a:b"`),
  `chat_messages.author_id`, `conversation_reads.user_id` (PK part)
- **comments**: `comments.author_id`, `post_likes.user_id`
- **notifications**: `notifications.user_id` + `actor_id` (str, nullable),
  `messages.user_id`, `device_tokens.user_id`, `channel_prefs.user_id` (PK),
  `preferences.user_id` (PK)
- **media**: `assets.owner_id` (avatars `PURPOSE_AVATAR` + any attachment
  assets) — the S3 object + row are orphaned unless purged

## Orchestrator — `auth` service

New authenticated endpoint **`DELETE /v1/platform/auth/account`**, JWT from the
caller's own cookie/header (`@jwt_required(locations=["cookies","headers"])`).
`user_id` comes from the token — a user can only delete themselves.

### Step 1 — Preflight (read-only; abort with nothing deleted)
- `POST leagues /internal/commissioned-leagues {user_id}` →
  `{leagues:[{id,name,status,member_count}]}` for non-archived leagues where
  `commissioner_id = user_id`.
- If non-empty → **409** `{error:"owns_leagues", leagues:[...]}`. (Live bets are
  NOT a block — decision 3 voids+refunds them.)

### Step 2 — Purge fan-out
Each service exposes `POST /internal/purge-user {user_id}`, guarded by
`internal_only` (X-Internal-Token), **idempotent**, returns row counts. auth
calls them over the mesh (`INTERNAL_<SVC>_URL`, mesh default in prod). Ordered so
money resolves before memberships/accounts vanish:

| # | Service | Deletes (private) | Keeps (anonymized shared history) |
|---|---|---|---|
| 1 | **contests** | `wager_invite_codes` (own); resolves every **money-held** wager the user is on: OPEN → refund proposer, status `cancelled`; **ACCEPTED** → `_void_refund` both, status `refunded`; **COMPLETED** → see finding H (settle to winner if decided, else void+refund) | terminal wagers only: `settled` / `declined` / `cancelled` / `refunded` |
| 2 | **wallet** | `balances` rows (play-money holdings; see caveat E) | `transactions` (ledger — never deleted) |
| 3 | **leagues** | `league_members`, `feed_reads`, `invite_codes` (own), **`league_invites` sent (`inviter_id`) + received (`invitee_id`)** | `picks`, `pick_confirmations`, `feed` posts — but **scrub the name out of the `member_joined` feed row via `meta->>'user_id' = user`** → "Deleted user" (finding K/O; NOT keyed on `author_id`, which is null on system posts) |
| 4 | **friends** | `friendships`, `invite_codes` | — |
| 5 | **messaging** | `conversation_reads` | `chat_messages`; DM `conversations` stay for the other user |
| 6 | **comments** | `post_likes` | `comments` |
| 7 | **notifications** | rows where `user_id = user` (feed `notifications`, `messages`, `device_tokens`, `channel_prefs`, `preferences`); **also scrub rows where `actor_id = user`**: `actor_name → "Deleted user"`, `actor_avatar_key → null` (see finding K) | counterparties' feed rows (scrubbed, not deleted) |
| 8 | **media** | `assets` where `owner_id = user` — **delete the S3 object FIRST, then the row** (finding L; row-first + S3-fail = orphaned object forever) | — |
| 9 | **users** | `favorite_teams` | `profiles` row **anonymized**: `display_name="Deleted user"`, `avatar_key=null` |

Contests MUST run first and before wallet+leagues so the refund credits land in
the still-existing league account and membership. `media` runs before `users` so
the `avatar_key=null` tombstone doesn't briefly point at a just-deleted asset
(cosmetic — both null the reference).

### Step 3 — auth (last)
Delete all `sessions` for the user, then **hard-delete `auth.users`** (frees the
phone's unique index for a fresh signup). Account row deleted LAST so a mid-fail
retry is always safe. The users `profiles` tombstone remains for every
`user_id → name` lookup.

**The DELETE response MUST run through `clear_auth_cookies(response)`** (the same
helper `logout` uses — `auth/app/utils/cookies.py`), expiring `waygerz_access`,
`waygerz_refresh`, AND the non-HttpOnly `waygerz_session` marker. Without this the
webui infinite-loops (finding M). Do this even though the tokens will soon be
dead — the browser must stop sending them immediately.

### Failure model
No distributed transaction. Every purge is idempotent (already-gone rows = no-op;
refunds idempotent on the wager `ref`). On any downstream failure, auth returns
500 and logs the failed step; the user (or an operator) re-runs `DELETE /account`
safely. Account row last guarantees identity survives a partial run.

## New endpoints / config to add

- **leagues**: `/internal/commissioned-leagues` + `/internal/purge-user`
- **contests, wallet, friends, messaging, comments, notifications, media, users**:
  `/internal/purge-user` each (media added per finding I)
- **auth**: public `DELETE /account` (route + controller + service orchestrator)
  and `INTERNAL_{WALLET,CONTESTS,LEAGUES,FRIENDS,MESSAGING,COMMENTS,MEDIA}_URL` in
  `Config`. Mesh default is `http://<svc>:8000/v1/<group>/<svc>` — **`<group>` is
  NOT uniform** (finding J): `gameplay` for wallet/contests/leagues, `social` for
  friends/messaging/comments, `platform` for media/users/notifications. Leave the
  URLs unset in prod (mesh default applies). auth already has
  `INTERNAL_NOTIFICATIONS_URL`, `INTERNAL_USERS_URL`, `INTERNAL_TOKEN`.

Reuse the existing east-west pattern from `auth/app/services/service_users.py`
(`requests.post(f"{url}/internal/...", headers={"X-Internal-Token": ...})`).

## webui

- `lib/auth.ts` → `authApi.deleteAccount()` = `DELETE ${AUTH_URL}${API.auth}/account`.
- `auth/AuthContext.tsx` → `deleteAccount()` (call it, then `setUser(null)`).
- `app/(app)/account/page.tsx` → a **Danger zone** `Card` at the bottom using the
  existing `components/ui/alert-dialog.tsx`, **type-to-confirm** ("DELETE").
  Success → toast + `router.push('/')`. 409 `owns_leagues` → render the blocking
  league list with links to each league.
- Mobile-first: ≥44px targets, destructive styling, ≥16px confirm input.

## Out of scope / notes

- **No DB migrations** — tombstone reuses existing columns.
- **Commissioner transfer UI** is assumed to already exist in league management;
  if it doesn't, that's a follow-up. The block is correct regardless.
- **Tests** written per service (purge idempotency + keep/delete correctness;
  contests void+refund; auth orchestration + commissioner block). NOTE: pytest
  can't run on the 2 GB dev host — verify logic by reading; run in CI/dev DB.
- **Mobile (Flutter)**: the same `DELETE /account` serves the native apps later;
  no mobile build now (per standing guidance).
- **Deploy**: bottom-up — per-service purge endpoints, then auth orchestrator,
  then webui. Commit per logical unit; deploy only on request. All 8 backend
  services + auth + webui must ship before the button is safe to expose.

## Audit findings (2026-09-03) — read before building

Verified against `contests/app/services/service_wagers.py` et al.

- **A. `COMPLETED` wagers still hold money.** Model comment: "event over, stakes
  still held, awaiting the winner's confirmation." The first draft kept
  "settled/completed" as history — WRONG: a purge that skips `completed` strands
  both stakes. **Money-held states are `accepted` AND `completed`; both must be
  `_void_refund`ed.** Only `settled`/`declined`/`cancelled`/`refunded` are
  terminal (no held money) and safe to keep. (Table row 1 fixed.)
- **B. Do NOT reuse the user-facing `cancel()` / `approve_cancel()`.** They
  enforce `_require_cancel_window` ("too close to start — bets lock N min before
  the game") and an ownership check, and will **raise** for a wager near/after
  kickoff — stranding the purge. The contests purge must do its own
  refund + status change, reusing only the low-level `refund()` and
  `_void_refund()` primitives (both idempotent on the wager `ref`).
- **C. Refunds are safe from an internal (no-JWT) purge.** ✅ `_wallet_op` posts
  to `WALLET_URL/internal/{op}` with `_itoken()` (X-Internal-Token) — no user
  token needed. This validates issuing refunds inside `/internal/purge-user`.
- **D. Commissioner-block granularity.** League statuses are
  `draft`/`active`/`completed`/`archived`. "Non-archived" also catches empty
  DRAFT leagues and finished COMPLETED ones. Refinement to consider: only block
  on leagues that have ≥1 OTHER active member; auto-archive leagues where the
  deleting user is the sole member instead of blocking. v1 may keep the blunt
  "any non-archived" block (safe, just occasionally annoying for solo leagues).
- **E. wallet balance vs ledger.** Deleting `balances` rows while keeping
  `transactions` breaks strict balance = Σ(ledger) reconciliation for that user.
  It's play money and the user is gone, so harmless — but if reconciliation
  tooling exists, prefer leaving the (now-orphaned) balance rows or zeroing them
  over deletion. Confirm before choosing.
- **F. `notifications.actor_id`** — ⚠️ **SUPERSEDED / WRONG, see finding K.** The
  original claim (leave `actor_id` rows, they resolve to the tombstone) is false:
  notifications store a denormalized `actor_name`/`actor_avatar_key` and a
  pre-rendered `body`, so those rows keep showing the real name. The purge must
  actively scrub them (table row 7 updated).
- **G. auth `DELETE /account` JWT.** Confirm the standard
  `@jwt_required(locations=["cookies","headers"])` + `get_jwt_identity()` pattern
  against an existing auth public route (e.g. `/me`) at build time; identity from
  the token guarantees self-only deletion.

### Second (independent) audit — additional findings

An adversarial pass against the code confirmed A–G and turned up three more:

- **H. (CORRECTNESS) `COMPLETED` must not blindly void+refund.** `COMPLETED` is a
  decided-but-unclaimed state: `settle_due` auto-**pays the winner** for a
  lingering `COMPLETED` row that has `winner_user_id`
  (`contests/app/services/service_wagers.py:1005-1033`). Void-refunding both
  would strip the *remaining* member's winnings and rewrite a result they rely
  on. **Rule: COMPLETED with `winner_user_id` set → `payout` the winner (settle);
  only `_void_refund` when the winner is unresolvable (null).** (Table row 1
  updated.) Note `COMPLETED` is a legacy state no current code sets, but the
  purge must still handle any that exist.
- **I. (GAP) media/avatar orphaning.** `media.assets.owner_id`
  (`api/media/app/models/asset.py:33`, avatars `PURPOSE_AVATAR` line 14) is never
  touched by the plan's other steps — nulling `profiles.avatar_key` leaves the S3
  object + `assets` row orphaned. **Added a `media /internal/purge-user`** (table
  row 8) to delete the user's owned assets (S3 object + row).
- **J. (GAP) `leagues.league_invites`.** A separate table from `invite_codes`,
  with `inviter_id` + `invitee_id` (`api/leagues/app/models/invite.py:24-25`) —
  the in-app invite inbox. The leagues purge must also delete invites the user
  **sent** (dangling pending invites) and **received**. (Table row 3 updated.)

Also confirmed no-change-needed: the gateway prefix `location` forwards DELETE
already, and the `internal|admin` edge-deny regex still 404s the new
`/internal/purge-user` paths — no gateway/ALB change. And there is **no** existing
endpoint returning a user's *commissioned* leagues (`/internal/user-league-ids`
returns only active memberships), so `/internal/commissioned-leagues` is
justified.

### Third (independent) audit — findings K–N

A third adversarial pass. Verified fine and needing no change: self-only auth
(identity in the JWT is the user id, no edge-reachable arbitrary-user delete);
partial-run re-safety (wallet dedupes every money op on unique
`(account,user_id,ref,type)`, so a re-issued refund/payout never double-moves —
this makes the whole retry story load-bearing-safe); sessions/JWT survive a
partial run (access tokens are stateless, no blocklist, and step 3 is last);
phone reuse (fresh random uuid, kept rows keep the old id, no re-association);
and purge-triggered notifications are best-effort (`_notify` /
`post_league_activity` swallow all exceptions + 3s timeout, no FK) so they can't
fail the purge.

- **K. (SHIP-BLOCKER, correctness) The tombstone doesn't reach denormalized
  name snapshots.** Two kept surfaces freeze the name at write time:
  - **notifications**: `actor_name` + `actor_avatar_key` are stored columns and
    `body` is pre-rendered with the name; `to_dict` serves them verbatim (no live
    re-resolve). So counterparties' alerts keep showing the real name. Fix: the
    notifications purge scrubs `actor_id = user` rows (row 7). (Rewriting the
    frozen `body` string is optional — the actor_name/avatar scrub covers the
    visible byline; decide whether to also blank the body text.)
  - **leagues feed**: the `member_joined` system post freezes the name in
    `title`/`body` (`"{name} joined"` / `"{name} joined the league."`); the byline
    overlays a live `author_name` but the frozen text doesn't. **DECIDED
    (2026-09-03): scrub the feed text too.** ⚠️ **See finding O for the correct
    locator** — these system posts have `author_id = NULL`, so the scrub is keyed
    on `meta->>'user_id' = user`, not `author_id`. (`league_created`'s `"{name}
    created"` is the *league* name, not the user — no leak, no scrub. messaging,
    comments, and wager lists all resolve names live — tombstone shows correctly
    there, no action.)
- **L. (build guard) media purge ordering.** Delete the S3 object before the
  `assets` row; a row-first delete that then fails the S3 call orphans the object
  with no row left to retry from. S3 delete of a missing key is a no-op, so
  S3-first is always safe.
- **M. (SHIP-BLOCKER, UX) DELETE must clear auth cookies.** The webui proxy gates
  on cookie existence; if the DELETE doesn't expire the cookies, `router.push('/')`
  ping-pongs `/` ↔ `/login` forever (the `(app)` layout bounces `!user` to
  `/login`, the guest proxy bounces the still-present cookie back to `/`). Return
  through `clear_auth_cookies(...)` (step 3, above) → clean rewrite to `/welcome`.
- **N. (accepted risk, low) stateless-token residual.** No JWT blocklist exists,
  so a *copied* access token authenticates downstream services for up to the
  15-min access-token TTL after the account is gone. Cookie-clearing stops the
  browser; a blocklist is out of scope for v1. Accept, or note for later.

### Fourth (feasibility) audit — findings O–Q

A build-readiness pass. Steps 1 (notif scrub), 3 (commissioner preflight), 4
(schema isolation), 6 (auth HTTP path) all VERIFIED cleanly buildable. Two spec
corrections + one minor note:

- **O. (CORRECTION) leagues feed scrub is keyed on `meta`, not `author_id`.** The
  leaking `member_joined` post has `author_id = NULL` ("null for system
  activity", `leagues/app/models/feed.py:24`); `service_leagues.py:753-755` writes
  `title=f"{name} joined"`, `body=f"{name} joined the league."`, `meta={"user_id":
  user_id}` with no `author_id`. So locate + scrub via `feed.meta->>'user_id' =
  :user` (JSONB). `league_created`'s `"{name} created"` is the *league* name, not
  a person — no leak. (Table row 3 corrected.)
- **P. (CORRECTION / RISK) contests purge MUST `_lock(wager)` before refund-vs-
  payout.** `_void_refund` doesn't lock internally (`service_wagers.py:748`) and
  refund vs payout are different `type`s under `uq_txn_idem`, so wallet dedup will
  NOT catch a cross-type race. If a scheduler `/internal/tick` settles the same
  `COMPLETED` wager (paying the winner) while the purge refunds both, money is
  double-moved. The purge must, per wager: `_lock(wager)` → re-read `status` under
  the lock → then decide (skip if now terminal / payout winner / refund) — the
  exact pattern `settle_one` and the `settle_due` COMPLETED loop already use.
- **Q. (minor) `notifications.actor_id` is unindexed** (`notification.py` indexes
  `user_id`/`read`/`created_at` only). The `actor_id = user` scrub is a seq scan —
  fine for a one-off self-delete at current scale; add an index only if it ever
  matters.

## Build order

1. `/internal/purge-user` in each of the 9 leaf services — contests, wallet,
   leagues, friends, messaging, comments, notifications, media, users (+ leagues
   `/internal/commissioned-leagues` preflight).
2. auth `DELETE /account` orchestrator + config.
3. webui danger-zone card + client.
4. Grep for stragglers, bounded typecheck + lint (webui), read-through of Python.
