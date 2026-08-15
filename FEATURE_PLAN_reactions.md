# Feature plan: Likes → Facebook-style reactions

Replace the single like on **league-feed posts** with a 6–7 emoji **reactions**
system (👍 ❤️ 😂 …). Well-contained: the entire like system lives in the
`comments` service + one web component, attaches only to feed posts, and fires no
notifications today.

## Current state (mapped 2026-08-15)
- **Model:** `post_likes` (`api/comments/app/models/post_like.py`): `id`,
  `post_id`, `user_id`, `created_at`, unique `(post_id, user_id)`. A like is a
  **row-exists boolean** — no type column. Attaches to a **feed `post_id`** (a
  `league_feed` row in the leagues service, opaque here); comments themselves
  can't be liked.
- **API** (`/v1/social/comments`): `POST /posts/<post_id>/like` = **toggle**
  (`service_comments.toggle_post_like`); `POST /posts/engagement` = batch counts
  → `{like_count, liked_by_me, comment_count}`. No list-likers endpoint.
- **Web:** `web/lib/comments.ts` (`toggleLike`, `engagement`, `PostEngagement`);
  the `Heart` like button in `web/app/(app)/leagues/[id]/feed-post.tsx`
  (`likeButton`, ~L176-190), fed by a batched engagement query in
  `overview.tsx`. Shown on the feed card + the post-detail dialog only.
- **Notifications:** none — liking notifies no one.

## Data model
Evolve `post_likes` (keep the table name — minimal churn, no cross-service refs):
- **Add `reaction` column** — `String(16)`, not null, e.g. `like|love|haha|wow|
  fire|money|rekt`. **One reaction per user per post** — keep the unique
  `(post_id, user_id)` constraint; changing a reaction UPDATEs the row (not
  insert), removing DELETEs it.
- **Backfill:** existing rows → `reaction = 'like'` (nothing lost; every current
  like becomes a 👍).
- New migration in `api/comments/migrations/` off the current comments head
  (verify head at build). The model class can stay `PostLike` (add the column) or
  rename to `PostReaction` — keep `PostLike` to avoid churn.

## The reaction set (✅ locked — sports-flavored 7)
Keys → emoji, tuned for a betting app:
| key | emoji | vibe |
|---|---|---|
| `like` | 👍 | default / acknowledge |
| `love` | ❤️ | love it |
| `haha` | 😂 | funny |
| `wow` | 😮 | shocked |
| `fire` | 🔥 | hype |
| `money` | 💰 | good call / ka-ching |
| `rekt` | 😭 | rough beat |
The set + keys live in ONE shared constant (backend validates the key; web renders
the emoji), so it's easy to tweak later.

## API changes
- **Set/change:** `PUT /posts/<post_id>/reaction` body `{reaction}` — upsert the
  caller's reaction (validate against the allowed set → 400 otherwise).
- **Remove:** `DELETE /posts/<post_id>/reaction` — delete the caller's row.
  (Tap-same-emoji-again = remove, handled client-side.)
- **Engagement** (`posts_engagement`): return per post `{reactions: {like: n,
  love: n, …} (only non-zero), total_reactions, my_reaction: <key>|null,
  comment_count}` instead of `{like_count, liked_by_me}`. Web is the only consumer.
- **Reactors list (✅ v1):** `GET /posts/<post_id>/reactions` → the list of
  reactors + each one's reaction key (resolve names/avatars via the users service
  `/internal/profiles`, same as comments already do for authors). Backs the
  tap-the-summary "who reacted" sheet.

## Web UI
- Replace `likeButton` with a **reaction control** (`web/components/reactions/…`):
  - **Pick a reaction (✅ tap-opens-bar — no default, no long-press):** tapping the
    React button **always opens the reaction bar** — a row of the 7 emojis, each a
    ≥44px target. Tap one to set it; tap your **current** one again to remove it;
    tap a different one to change. Simpler on mobile than long-press (no gesture
    fighting scroll, no accidental likes). Desktop identical (click opens the bar).
  - **My state:** if `my_reaction` is set, the React button shows that emoji,
    highlighted; else a neutral "React" affordance.
  - **Summary:** top ~3 distinct reaction emojis + total (e.g. "👍❤️🔥 12"), tap →
    the **reactor sheet** (v1) listing who reacted with what.
  - Optimistic update; reconcile from the engagement query on settle.
- `web/lib/comments.ts`: `setReaction(postId, key)`, `removeReaction(postId)`;
  `PostEngagement` → the reactions breakdown + `my_reaction`.
- Same control renders on the feed card footer and the post dialog (one component,
  both call sites in `feed-post.tsx`).

## Notifications (✅ v1 — "X reacted to your post")
Net-new for comments (it never calls notifications today). Pieces:
- **Post author (NO leagues change — audit-corrected):** the author id is already
  available. Comments already calls leagues `POST /internal/feed-post-access` for
  every access check, and that response **already includes `author_id`** (leagues
  `service_internal.py`) — comments just ignores it today. So comments reads
  `post["author_id"]` off the access result; **leagues needs zero changes.**
  **Null author:** `league_feed.author_id` is nullable (null for system/activity
  posts) — skip the notify when it's null. Also skip when `author_id == reactor`.
- **Notify:** comments POSTs notifications `POST /internal/notify` with
  `channels:["inapp"]` on a reaction. Register the **opt-outable in-app category**
  `reaction` by adding one entry to **`CHANNEL_DEFAULTS`**
  (`"reaction": {"sms": False, "inapp": True, "push": False}`) in notifications
  `service_internal.py` — that alone makes it appear in the prefs matrix and be
  mutable via the sparse `NotificationChannelPref` table (no migration).
  (Audit note: do NOT rely on `APP_NOTIFICATION_CATEGORIES` — that only gates the
  SMS master switch, irrelevant for an in-app-only category.) Comments needs a new
  `NOTIFICATIONS_URL` config + `X-Internal-Token` client (it has none today).
  `deep_link` → the league feed / post. Title like "Marcus reacted 🔥 to your post".
- **Account toggle = 3 web edits (audit-corrected):** the category is not
  auto-derived on the web — add `'reaction'` to the `NotificationCategory` union
  (`web/lib/notifications.ts`), a `{key:'reaction', …}` entry to `CATEGORIES`
  (`web/components/account/notifications-card.tsx`), and a `case 'reaction'` icon
  in `notifMeta` (`web/app/(app)/notifications/page.tsx`).
- **Anti-spam:** **don't notify self-reactions**; **dedup per `(post, reactor)`**
  (`dedup_key=reaction:{post_id}:{reactor_id}`, unique, fits in 160 chars) so a
  user toggling/changing their reaction doesn't re-ping the author. Dedup is
  notify-once-ever per key, so a *changed* reaction (🔥→😂) won't re-notify — that
  is the intended v1 behavior (full FB-style "Marcus and 3 others" collapse is v1.1).

## Services touched + deploy (audit-corrected: 3 services, NOT 4 — leagues drops out)
- **comments** — reaction column + migration + backfill; set/remove/reactors
  endpoints; engagement breakdown; notify-author on reaction (new
  `NOTIFICATIONS_URL` + internal client); read `author_id` off the existing
  feed-post-access result. `USERS_URL` is already wired — but `resolve_users`
  returns `display_name` **only**, so extend it to also carry `avatar_key` (the
  users `/internal/profiles` response already includes it) for the reactor sheet.
- **notifications** — one line: add `reaction` to `CHANNEL_DEFAULTS` (in-app-only).
- **webui** — reaction control (tap-opens-bar) + reactor sheet + the 3 category
  edits above + the `reaction` notification-feed card.
- **leagues** — ~~changes~~ **none** (author_id already exposed and already
  received by comments).

Deploy: comments migration (`flask db upgrade`, additive: add `reaction` with
`server_default 'like'` → backfill is automatic → optionally drop the default),
then roll comments + notifications + webui. No new infra.
**Backward compat mid-roll:** keep the old `POST /posts/<id>/like` toggle route as
a thin alias (maps to `reaction='like'`) so an un-rolled webui still works.

## Decisions (locked 2026-08-15)
1. ✅ **Reaction set = sports-flavored 7** (👍 like · ❤️ love · 😂 haha · 😮 wow ·
   🔥 fire · 💰 money · 😭 rekt).
2. ✅ **Interaction = tap-opens-bar** (no default like, no long-press; tap your
   current reaction to remove).
3. ✅ **Reactor list in v1** — `GET /posts/<id>/reactions` + the who-reacted sheet.
4. ✅ **Notifications in v1** — "X reacted to your post", in-app + opt-outable,
   deduped per (post, reactor), no self-notify.

## Audited 2026-08-15 (against live code, 4 parallel reviewers)
Migration head = `c2d3e4f5a6b7`. Confirmed: `post_likes` shape + `uq_post_like_user`,
engagement shape `{like_count, liked_by_me, comment_count}` (keep `comment_count`),
`/internal/notify` supports category/channels/deep_link/actor/dedup_key, no DB
migration needed for the category. Corrected into the plan above: leagues change
removed, null-author handling, `CHANNEL_DEFAULTS`-not-`APP_NOTIFICATION_CATEGORIES`,
the 3 web category edits, and the avatar fetch. Web note: the like button is one
shared node passed by prop to both render sites (feed footer + post dialog), so the
reaction bar needs per-instance state, and the `['feed-engagement', lg.id, …]`
query-key prefix relationship must be preserved.

## Constraints
- Mobile-first: the reaction bar needs ≥44px emoji targets, a plain tap (no
  long-press — locked decision #2), and no horizontal overflow. Commit each edit;
  deploy only when told.
