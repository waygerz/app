# Waygerz UX Walkthrough — Everything You Can Do

> **What this is.** A screen-by-screen, state-by-state narration of the actual
> user journey through the app as it behaves **today**, grounded in the live
> webui (`web/app/…`, `web/components/…`, `web/lib/…`). It covers the whole
> surface: getting in, your profile & personalization, people (friends + DMs),
> the two league play modes, browsing sports, and the cross-cutting plumbing.
>
> For the deep gameplay mechanics it stays companion to the gap-to-ship plans —
> where a screen is missing or half-built it's flagged inline as
> **[gap → PICKEM Gx]** / **[gap → H2H Bx]** pointing at
> [`PICKEM_BUILD_PLAN.md`](./.docs/PICKEM_BUILD_PLAN.md) and
> [`H2H_BUILD_PLAN.md`](./.docs/H2H_BUILD_PLAN.md).
>
> **Map:** Part 1 gets you in (onboarding). Part 2 is *you* (profile, avatar,
> colors, notifications). Part 3 is *people* (friends + messaging). Parts 4–6 are
> leagues and the two play modes. Part 7 is browsing sports. Part 8 is the
> cross-cutting surfaces (notifications, deep links, feed). Part 9 is mobile
> parity.

---

## 0. The shell

Three route groups gate the whole app (`web/proxy.ts` middleware, keyed on the
`waygerz_access` cookie):

- **`(guest)`** — logged-out: `/login` (phone → OTP → profile/consent). `/signup`
  is a bare redirect to `/login`.
- **`(app)`** — authenticated: leagues, bets, sports, friends, messages,
  notifications, account.
- **`(public)`** — shareable pages that render for logged-out visitors:
  `/welcome` (marketing), `/c/<code>` (invite + bet links), `/terms`, `/privacy`.

**Navigation surfaces:**

- **Mobile bottom nav** (`shell/bottom-nav.tsx`, hidden on `lg:`) — five tabs:
  **Leagues** (`/`), **Bets** (`/bets`), **Alerts** (`/notifications`, unread
  badge), **Messages** (`/messages`, unread badge), **Profile** (opens the
  profile menu). Sits above the safe-area inset; `min-h-14` targets.
- **Desktop top bar** (`shell/navbar.tsx` + `shell/header-toolbar.tsx`) — primary
  nav is just **Leagues** and **Bets**; the toolbar adds a **Messages** icon and
  a **Bell**, each with an unread badge, plus the avatar/profile menu. (Sports is
  reached through league creation; Friends through the profile menu — neither is
  a top-level link by design.)
- **Header title** (`shell/header-logo.tsx`) — on mobile shows the current page's
  name (My Leagues, My Bets, Account, Friends, Messages, Notifications, a sport
  slug, …); suppressed on chat threads and ESPN pages, which render their own
  header.
- **Profile menu** (`shell/profile-menu.tsx`, shared by both nav surfaces) —
  avatar + name + phone, then **Account**, **Friends**, a **light/dark theme
  toggle** (next-themes), and **Sign out**.

Inside `(app)`, a league opens into a **tabbed container**
(`leagues/[id]/layout.tsx`): a header (league avatar, type badge, a **Draft**
badge while unactivated, member/period summary line) and a pill tab-nav. The tab
set is **mode-aware**:

| Tab | Pick'em | H2H | Notes |
|-----|:---:|:---:|-------|
| Overview | ✓ | ✓ | feed + this-week widget |
| Sports | — | ✓ | money leagues only |
| **Play** | "My Picks" | "My Bets" | the mode's core surface |
| Results | ✓ | ✓ | weekly leaderboard / settled bets |
| Standings | ✓ | ✓ | season record |
| Wallet | — | ✓ | league-scoped balance |
| Members | ✓ | ✓ | roster + roles |
| Manage | commissioner only | commissioner only | edit, rules, activate |

---

## Part 1 — Getting in: onboarding

### 1.1 Sign in / sign up — `/login` (`(guest)/login/page.tsx`)

One passwordless wizard handles both sign-in and first-time signup — a single
component with five internal steps and a `StepProgress` indicator on the profile
steps.

1. **Phone** — a US-formatted phone input (`inputMode="tel"`, `h-14`) →
   **"Text me a code"** starts the OTP (`useAuth().startOtp`).
2. **Code** — a 6-digit OTP input (`inputMode="numeric"`,
   `autoComplete="one-time-code"`) → **"Continue"** verifies
   (`useAuth().verifyOtp`). A **"← Use a different number"** ghost link resets to
   step 1. If the account already exists, you're routed to your `?next=`
   destination; a brand-new number falls through to the profile steps.
   - **Dev OTP reveal** — while there's no SMS provider, the returned code is
     shown on-screen in a dashed box ("Testing code: …"). **[stub — remove once
     SMS is wired.]**
3. **Name** (Step 1 of 3) — display-name input (`maxLength 64`, autofocus) →
   **"Next"**.
4. **Terms** (Step 2 of 3, required) — two checkboxes, **"I agree to the Terms of
   Service"** and **"I agree to the Privacy Policy"**, each wrapping an inline
   `LegalLink` that opens the doc in a dialog without leaving the flow. **"Next"**
   stays disabled until both are checked.
5. **SMS** (Step 3 of 3, optional) — two independent opt-ins: **transactional
   SMS** and **marketing SMS** (both default off, both skippable). **"Create my
   account"** calls `completeProfile(...)` with the consent snapshot
   (`tos_version`, `tos_accepted`, `sms_transactional`, `sms_marketing`) and
   routes to `?next`.

### 1.2 Arriving via a shared link — the pending-link banner

If you hit `/login?next=/c/<code>` (someone shared a league/bet/friend link and
you weren't signed in), a **`PendingLinkBanner`** previews what's waiting: "Log
in to join **<league>**", "…to answer your bet", "…to connect". It's a read-only
preview — after you finish the wizard you're dropped straight onto the `/c/<code>`
page to act. (The link is stashed via `lib/pending-link.ts` so it survives the
whole OTP round-trip.)

---

## Part 2 — You: profile & personalization

Everything here lives on **`/account`** (`(app)/account/page.tsx`), a single
column of cards. This is the "change your avatar, name, colors" surface.

### 2.1 Avatar

A large circular **drop zone**: click it (or the **Choose image / Upload new**
button) to pick a file, or **drag an image onto the circle**. The image is
converted to a 256px square WebP client-side (`imageToWebp`) and uploaded
(`mediaApi.upload('avatar', …)` → `setAvatar`). A small **✕** clears it back to
the initials fallback. Below, a **"Recent — tap to reuse"** row shows your last
few uploads so you can switch back without re-uploading; the active one wears a
green check.

### 2.2 Display name & phone

- **Display name** — an input + **Save** (disabled until it changes);
  `updateProfile({ display_name })`.
- **Phone** — read-only. It's your sign-in identity and can't be changed here
  yet.

### 2.3 Favorite teams — the profile brand pills

A **FavoriteTeamsCard** shows your chosen teams as brand-colored pills (spec in
`.docs/FEATURE_PLAN_favorite_teams.md`). Server-persisted via
`usersApi.getMyProfile` / `saveFavorites` (replace-all).

- **+ Add team** opens a bottom-sheet **TeamPicker** that drills **sport → league
  → team** (with a team search that uses `text-base` to dodge the iOS zoom, and
  `≥44px` cells). Tapping a team adds it; already-added teams show a check.
- Per team you can make one **Primary** (moves it to the front) or **Remove** it
  (✕). There's a `MAX_FAVORITE_TEAMS` cap; the add button reads "Maximum reached"
  when full. Loading → skeletons; load failure → **Retry**.

> **Two unrelated "favorites."** This account-level favorite-*teams* list is
> server-synced. The **star you pin on a sports *league*** (Part 7) is a
> *separate*, device-local (localStorage) list — don't conflate them.

### 2.4 Appearance — colors, dark surface, light/dark

The **Appearance** card is where the app's look is personalized (persisted to
localStorage on this device — **[gap → server-sync across devices is a TODO]**).

- **Colors** — two rows of **7 ROYGBIV swatches** each: a **Primary** hue and an
  **Accent** hue (`theme/color-picker.tsx`). Picking one stamps
  `data-primary` / `data-accent` on the document and re-themes the app's CSS vars
  app-wide (defaults: primary = violet, accent = green). Applied pre-paint, so no
  flash.
- **Dark shade** — **4 surface presets** (Slate / Soft / Lifted / Flat,
  `theme/surface-picker.tsx`), each a mini page/card preview. Swaps the dark
  neutral ramp; **affects dark mode only**.
- **Light/dark toggle** itself lives in the **profile menu** (Moon/Sun), separate
  from these color/surface choices.

### 2.5 Notifications & promotions (SMS consent)

Two independent cards over one prefs record (`notificationsApi.getPreferences` /
`updatePreferences`, optimistic with rollback):

- **NotificationsCard** — a master **"Allow SMS for Notifications"** switch, then
  a per-category grid (**SMS × In-app**) for `wager_alert`, `league_invite`,
  `friend_request`, `reaction` (in-app only), and `weekly_digest`. Turning the
  master off pauses the whole SMS column. Fine print carries the transactional
  consent copy + legal links, and notes sign-in codes are always sent.
- **PromotionsCard** — fully separate: **"Allow SMS for Promotions"** and **"Show
  in the app"**, with the marketing-consent copy.

### 2.6 Agreements & sign out

- **Agreements** card — a read-only record of when you accepted the Terms &
  Privacy Policy (with `LegalLink`s to re-read them). Null for accounts created
  before consent tracking.
- **Sign out** — from the profile menu (`logout()` → home).

---

## Part 3 — People: friends & messaging

### 3.1 Friends — `/friends` (`(app)/friends/page.tsx`)

- **Add Friends** (top-right) shares your personal invite link via the native
  share sheet (`navigator.share`, clipboard fallback) — the link resolves to your
  `/c/F<code>` friend page.
- **Incoming requests** — each row has **Accept** / **Decline**.
- **Your friends** — each row has a **Message** button (opens/creates the DM and
  routes to `/messages/<id>`) and an overflow menu with **Remove friend**
  (confirms first). A client-side **search** appears once you have more than 8.
- **Pending sent** — read-only rows.
- States: loading → skeleton rows; no friends → `CenterCard` ("share your
  link…"); no search match → `CenterCard`.

### 3.2 Messages inbox — `/messages` (`(app)/messages/page.tsx`)

> **This replaced the old right-side Messages sheet** — DMs and league chats are
> now first-class, linkable pages.

Conversation rows (`ConversationRow`, each a `Link` to `/messages/<id>`) split
into **Unread · N** and **Earlier** groups. Unread rows get a left accent bar,
tinted background, bold title, and a count pill (`9+` cap). Titles resolve to the
league name, the other person's name, or "Direct message"; the preview line
prefixes "You:" / "<author>:".

- **Mark all read** (in the Unread header) reads every unread conversation.
- **Empty state** — a `CenterCard` plus one **"Start a league chat"** button per
  league you're in (creates/opens that league's conversation and routes into it).

### 3.3 Chat thread — `/messages/[conversationId]`

The thread renders its own header (avatar + title; league chats show a "League
chat" subline) with a **Back** arrow (`size-11`) to the inbox.

- **Send** — an input + **Send** button (`size-11`); **Enter** also sends. New
  messages append optimistically.
- **Live** — an **SSE** stream (`messagingApi.streamUrl`) delivers new messages,
  typing state, read receipts, and edits/deletes in real time; the list
  auto-scrolls and marks-read on open.
- **Typing indicator** — an animated three-dot bubble when the other side is
  typing (your own typing is debounced out to them).
- **Read receipts** — a `CheckCheck` on **your** messages, in **direct**
  conversations, once they're read.
- **League chats** color and group each sender; day dividers separate dates.

> **[stale/removed] In-thread bet cards.** The thread deliberately **skips**
> `kind === 'bet'` messages — there is no BetSlip / inline Accept-Reject in the
> chat anymore. Bets reach you through the **Notifications page** and the
> **`/c/B<code>`** link (see Parts 6 & 8). The `ChatMessage.kind`/`meta` fields
> still exist in `lib/messaging.ts` but render nothing today. Per the product
> rule, bets only ever touch the 1:1 DM context + notifications, never a league
> group chat — but on web that "DM bet card" is not currently drawn.

---

## Part 4 — Leagues: the setup journey (shared by both modes)

### 4.1 Create a league — `/leagues/new` (`new/page.tsx`, the wizard)

The commissioner walks a short wizard:

1. **Name & identity** — league name, optional logo (upload → data/URL).
2. **Type** — **Pick'em** (free, pick winners) vs **Head-to-Head** (money
   wagers). *This single choice forks everything downstream.*
3. **Cadence** — `weekly` or `season` (`period_type`).
4. **Sports** — pick ≥1 sport/league from the ingestor catalog (required). The
   first becomes the "primary" that seeds the weekly schedule.
5. **Money settings (H2H only)** — starting balance, min/max wager. Hidden
   entirely for Pick'em.

On submit the league is created **DRAFT**, with a reusable invite code, the
commissioner as first member, and a `league_created` feed entry.

### 4.2 The Draft state — activate

A freshly created league shows a **Draft** badge and an **Activate** button in
the header (commissioner only, `layout.tsx`). Until activated there are no
periods and no play. Activating:

- **Weekly Pick'em** → prebuilds one period per upcoming real ingestor week and
  opens the earliest.
- **Season / H2H** → opens a single period.

> **[gap → PICKEM G7 / decision]** Whether "season" Pick'em is a first-class
> launch mode is an open question; weekly is the fleshed-out path.

### 4.3 Invite & grow — the invite dialog + `/c/<code>`

From the header **Invite / Share** dialog a commissioner/moderator can:

- **Copy the shareable link** (`/c/L<code>`, reusable) — anyone with it lands on
  a **public preview page** (`(public)/c/[code]/page.tsx`): league name, avatar,
  member count, and a context-aware CTA. Logged-out → prompted to sign in first,
  then auto-joined; logged-in non-member → one-tap **Join**; already a member →
  "Open league."
- **Invite friends** directly (`invite_friends`) — creates PENDING
  `LeagueInvite`s and fires a notification to each. Recipients see them in an
  **Invites inbox** (`my_invites`).

> **[gap → PICKEM G4]** The invitee can accept but **cannot decline**, and the
> sender **cannot revoke** — those states exist in the model but have no button
> or endpoint. **[gap → PICKEM G5]** "Invite this specific friend" one-time codes
> are designed but not wired; only the one reusable link exists.

### 4.4 Join — the member's first view

A new member lands on **Overview**: the league **feed** (announcements +
system activity like "Marcus joined", "Week 3 is open", "🏆 …") with inline
comments/likes (`feed-post.tsx`, backed by the comments service), plus a
**this-week widget** nudging them toward the play tab. For H2H, joining also
triggers a commissioner **credit grant** into their `league:{id}` wallet.

### 4.5 Members & roles — the Members tab

Roster with avatars and roles (**Commissioner / Moderator / Member**). The
commissioner can promote/demote moderators, transfer the commissionership
(old commish → moderator), remove members, and archive the league. Each member
row also carries **Message** / **Add friend** shortcuts. A member can leave (the
commissioner cannot leave without transferring or archiving).

---

## Part 5 — Pick'em play loop

*Tabs used: Overview → My Picks → Results → Standings.*

### 5.1 My Picks — the weekly slate (`sections.tsx` `PickemPlay`)

The core screen. A **week selector** (combobox, defaults to the open week) drives
a list of that week's games pulled live from the ingestor. Each game is a
**home / away pick card**; tapping a side selects it. The week's **last game**
carries a **tiebreaker** input (predict the combined score — the Monday-night
tiebreaker).

**Pick states a member sees:**

- **Open & editable** — the current week, before lock. Picks upsert live.
- **Locked** — the FE hides/locks the slate **1 hour before the first game**;
  individual games also lock the moment they kick off (server-enforced in
  `submit_picks`).
- **Graded** — after games go final, each pick shows a ✓ (correct) or ✗ (wrong)
  badge.

> **[gap → PICKEM G2]** These two lock rules (whole-slate-at-T-minus-1h vs.
> per-game-at-kickoff) come from **different sources of truth** and can disagree;
> the plan consolidates them onto a persisted `CLOSED` period state.
> **[gap → PICKEM G8]** A voided/postponed game currently just shows the pick as
> a silent ✗ loss — no "game voided" explanation.

If the commissioner hasn't synced a schedule yet, they see a **"Sync schedule"**
button instead of a slate.

### 5.2 Results — the weekly leaderboard (`PickemResults`)

Once a week rolls over, Results shows the **ranked leaderboard** for that week:
each member's correct-pick count, the tiebreaker column, and competition rank
(ties share a rank, broken by tiebreaker distance to the last game's actual
combined score). The commissioner/moderator gets a **green-check confirm button**
per member (`ConfirmMemberButton`). Members can peek at each other's picks via
`MemberPicksDialog` — but only **after** the slate locks (fails closed until 1h
before the first game; owner/commish see anytime).

### 5.3 Standings — the season view

Season-long **wins/losses** aggregated across every graded pick, ranked. This is
the running scoreboard across all weeks.

### 5.4 The lifecycle from the member's chair

```
Week opens ──► you get "Week N is open" in the feed
    │            [gap → PICKEM G3: no push/DM reminder to actually pick]
    ▼
You make picks ──► editable until T-1h / kickoff
    ▼
Slate locks ──► picks frozen; opponents' picks now visible
    ▼
Games go final ──► picks auto-grade ✓/✗ (scheduler tick)
    ▼
Week rolls over ──► "🏆 <winner> took Week N" posts to the feed
    ▼
Next week opens … (repeats)
    ▼
Season ends ──► ??? [gap → PICKEM G1/G6: no completion, no champion moment;
                     the league just stays ACTIVE forever]
```

---

## Part 6 — Head-to-Head betting loop

*Tabs used: Wallet → My Bets → Results, plus the propose flow that lives on the
schedule/matchup surfaces.*

### 6.1 Wallet — your league bankroll (Wallet tab)

Each H2H league has its own **play-money balance** (`league:{id}` account,
`wallet.ts` `formatCredits`). The tab shows the current balance and a
**transaction history** (grants, holds, payouts, refunds). Money enters only via
the commissioner's join-grant.

> **[gap → H2H B0]** This is **play money** — no real cash. Whether it ever
> becomes real money is the launch-gating decision. **[gap → H2H B4]** A member
> who busts has no re-buy-in, and the commissioner has no "grant more credits"
> button.

### 6.2 Propose a bet (`sections.tsx` — `ScheduleBetDialog` / `MatchupBetDialog`)

From a game on the league's schedule/matchup surface, a member opens the bet
dialog and sets:

- **The game** (an upcoming, `scheduled` event).
- **Bet type** — moneyline (pick the winner), spread (with a `line`), or total
  (over/under a `line`).
- **Stake** — an amount within the league's min/max… or **$0 "bragging rights"**
  (loser buys a beer), which bypasses the bounds.
- **Opponent(s)** — one or several co-members; each becomes an independent 1v1
  offer.

On submit the proposer's stake is **held** (debited immediately).

> **[gap → H2H B2]** Every wager is **strictly even-money** regardless of the
> real line; `event.odds` is ingested but not surfaced or priced in.

### 6.3 The bet arrives — where the opponent sees it

A proposed bet reaches the opponent in two coordinated places (plus its home on
the bets list):

1. **A notification** (`/notifications`) — an actionable row with inline
   **Accept / Reject** and a `/c/B<code>` deep link. This is the primary surface.
2. **The `/c/B<code>` public page** (`(public)/c/[code]`) — an accept/decline
   preview (matchup, your pick, stake) that works even from a cold link.
3. **My Bets** (`/bets/[filter]`) — the offer also shows up in the recipient's
   **Pending** tab with the same actions.

> **[was: DM bet card]** Earlier builds also dropped a `BetSlip` card into the
> two players' DM thread with inline Accept/Reject. That in-thread card is **no
> longer rendered** (Part 3.3) — the DM still exists as a place to talk, but bet
> *actions* now live on notifications + the `/c/` link + My Bets. Per the
> DM-only product rule, bets never touch a league group chat.

### 6.4 Accept / decline / cancel

- **Accept** → the acceptor's stake is held too; the wager goes **accepted** and
  both bankrolls now show the money as committed. The proposer is notified.
- **Decline** → proposer refunded, wager **declined**.
- **Proposer cancels** an un-accepted offer (>10 min before kickoff) → refunded.
- **Mutual cancel of a live bet** → one side **requests cancel**, the other
  **approves** (both refunded) or **rejects** (bet stands). Locked in the final
  10 minutes before start.

### 6.5 My Bets — the list (`bets/[filter]/page.tsx`)

The dedicated bets surface, filterable: **Pending / Active / Closed / Cancelled /
All** (`bets-common.tsx`). Sibling wagers — the same game/pick/stake offered to
several people — **collapse into one grouped card** (`groupWagers`) showing the
opponents together. Each card carries the contextual actions (accept, decline,
cancel, request/approve cancel).

### 6.6 Settlement — the payoff

No user action required. The scheduler tick refreshes the event and, once it's
**final**, auto-grades from the score:

- **You won** → you're paid **2× the stake**; the card shows **Settled / +$X**.
- **Push** (spread/total lands exactly, or no winner) → both refunded.
- **Game cancelled / never finished (6h grace)** → both **void-refunded**.

> **[gap → H2H B1]** A vestigial "winner confirms the pot" path still exists in
> the model/API/FE (`completed` status, `confirm`), but auto-settle has replaced
> it — the plan removes it. **[gap → H2H B3]** If the ingestor can't resolve a
> game, the only outcome is a silent 6h void-refund — there's **no dispute or
> commissioner manual-grade** path, and no "your bet was voided because…"
> notification.

### 6.7 The lifecycle from the bettor's chair

```
You propose ──► stake held; offer lands in notifications + /c/ link + My Bets
    ▼
Opponent accepts ──► their stake held; bet is live (both bankrolls committed)
    │  └─ or declines/cancels ──► refund, done
    ▼
Game plays ──► (optional) mutual-cancel handshake until T-10m
    ▼
Game final ──► auto-grade from score (scheduler tick)
    ▼
Winner paid 2× / push refunds both / void refunds both
    │            [gap → H2H B3: no dispute path if score never resolves]
    ▼
Settled ──► result on the card; ledger updated
             [gap → H2H B8: no "here's how it paid out and why" receipt]
```

---

## Part 7 — Browsing sports & events

Reached from league creation and the sports picker. Two shapes: **team sports**
(a league → events flow you can bet on) and **ESPN sports** (golf / racing / mma
/ cricket — read-only stat pages).

### 7.1 Sport picker — `/sports` (`sports/page.tsx`)

A grid of sport cards (emoji + name, `fetchSports`). Loading → skeletons; a load
error shows an inline message.

### 7.2 Leagues within a sport — `/sports/[slug]` (`sports/[slug]/page.tsx`)

For a team sport, a grid of **league cards** (logo, season, "Tournament" badge)
linking to that league's events. Each card has a **favorite star** in the corner:
tapping it **pins/unpins** the league (`toggleFavorite`, `lib/favorites.ts`).

> **Note:** this pin list is **device-local** (localStorage) and separate from
> the server-synced favorite *teams* on your account (Part 2.3).
> **[gap → per-user sync is a TODO]**

For an ESPN sport (`isEspnSport`), the page instead renders `EspnSportList` (7.4).
Loading → skeletons; empty → `CenterCard` ("No leagues found"); error inline.

### 7.3 Bettable events — `/sports/[slug]/leagues/[league]`

A grid of **`EventCard`s** for the league's upcoming games
(`fetchLeagueEvents`) — the tap-to-bet entry point for team sports. Empty →
`CenterCard` ("No events right now — this league may be between seasons").

### 7.4 ESPN sports — list & detail

- **List** (`components/espn/sport-list.tsx`) — summary rows per event
  (`fetchEspnList`) with a status badge and an **"Upcoming only"** toggle
  (default on; flip off to reveal past results).
- **Detail** (`/sports/[slug]/[externalId]` → `espn/event-detail.tsx`) —
  read-only: a **Leaderboard** (golf/racing), **FightCard** (mma), or
  **MatchCard** (cricket/team). **No bet entry here.** **[gap → betting from ESPN
  detail is unbuilt.]** Non-ESPN slug → "Not found."; scheduled-but-empty →
  an "Upcoming" card.

---

## Part 8 — Cross-cutting surfaces

- **Notifications** (`/notifications`, `(app)/notifications/page.tsx`) — the
  activity feed: league invites (**Join**/**Dismiss**), bet proposals
  (**Accept**/**Reject**), friend requests (**Accept**/**Decline**), reactions,
  results. Actions resolve **inline** (and the row deep-links + marks read on
  click). Win rows read green, losses red. A stale-bet guard disables actions
  when the underlying wager is no longer `open`. Honors the SMS/in-app prefs from
  Part 2.5. **Replaced the old Notifications sheet.**
  *Today it under-covers Pick'em* (no pick reminders, no results ping)
  **[gap → PICKEM G3]** and settlement pings for H2H are thin.
- **Messages / DMs** (`/messages` + `/messages/[id]`, Part 3) — real chat with
  SSE live updates, typing, and read receipts. **Replaced the old Messages
  sheet.** In-thread bet cards were removed (Part 3.3).
- **Deep links `/c/<code>`** — one public surface for league invites (`L…`),
  friend invites (`F…`), and bets (`B…`), rendering a preview + the right CTA for
  logged-in/out and member/non-member viewers. Guests are bounced to login and
  replayed back here afterward.
- **Feed + comments** — the league's social spine; system activity
  (joins, period open/final, wager accepted/settled) and member announcements,
  each commentable and with **reactions** (`.docs/FEATURE_PLAN_reactions.md`).

---

## Part 9 — Mobile parity (Flutter iOS + Android)

Every surface above is served by the same REST API, so the native app reproduces
the *journeys*, not just the screens:

- **`/c/<code>`** invite and bet links must resolve as **universal / app links**
  into native preview screens mirroring `(public)/c/[code]`.
- **Reminders & settlement** should reach **APNs/FCM push** (pending the
  notifications device-token work), not just the in-app feed.
- **Locks & results** should be read from server state (period `status`, wager
  `status`) so the native client never re-implements the T-1h / kickoff math —
  another reason to land **PICKEM G2**.
- **Bet-in-DM (native, planned):** per the DM-only product rule, the native app
  *may* render a `kind:"bet"` message + inline Accept/Reject card in the 1:1
  thread from the message's `meta` snapshot. **Web does not currently draw this**
  (Part 3.3) — if it ships native, it's a deliberate re-add there, and web's
  bet-action surfaces stay notifications + `/c/` + My Bets.
- **Personalization** — avatar, display name, favorite teams, and the SMS
  consent toggles are all API-backed and reproduce natively; the color/surface
  theme is currently device-local (localStorage) and needs the per-account sync
  before it carries across web ↔ native.

---

## Appendix — screen ↔ code index

| Screen / surface | Code |
|---|---|
| Login / onboarding wizard | `web/app/(guest)/login/page.tsx` |
| Pending-link banner | `web/components/pending-link-banner.tsx`, `web/lib/pending-link.ts` |
| Account (avatar, name, favorites, appearance, consent) | `web/app/(app)/account/page.tsx` |
| Color / surface pickers | `web/components/theme/color-picker.tsx`, `surface-picker.tsx` |
| Notification / promotion consent | `web/components/account/notifications-card.tsx` |
| Favorite teams + picker | `web/components/account/favorite-teams-card.tsx`, `web/components/team-picker.tsx` |
| Friends | `web/app/(app)/friends/page.tsx` |
| Messages inbox / thread | `web/app/(app)/messages/page.tsx`, `messages/[conversationId]/page.tsx` |
| Notifications feed | `web/app/(app)/notifications/page.tsx` |
| Unread badge hooks | `web/lib/messaging.ts` (`useUnreadMessages`), `web/lib/notifications.ts` (`useUnreadNotifications`) |
| Create wizard | `web/app/(app)/leagues/new/page.tsx` |
| League container + tabs | `web/app/(app)/leagues/[id]/layout.tsx` |
| Overview + feed | `[id]/page.tsx` → `overview.tsx`, `[id]/feed-post.tsx` |
| Pick'em play / results / standings | `[id]/sections.tsx` (`PickemPlay`, `PickemResults`, `LeagueStandings`) |
| H2H propose dialogs | `[id]/sections.tsx` (`ScheduleBetDialog`, `MatchupBetDialog`, `WagerBetCard`) |
| My Bets list | `web/app/(app)/bets/[filter]/page.tsx`, `bets-common.tsx` |
| Wallet | `web/lib/wallet.ts` + Wallet tab in `sections.tsx` |
| Sports browse | `web/app/(app)/sports/page.tsx`, `sports/[slug]/…`, `web/lib/favorites.ts` |
| ESPN list / detail | `web/components/espn/sport-list.tsx`, `espn/event-detail.tsx` |
| Deep-link preview | `web/app/(public)/c/[code]/page.tsx` |
| Marketing / legal | `web/app/(public)/welcome/page.tsx`, `terms/page.tsx`, `privacy/page.tsx`, `web/components/legal/legal-dialog.tsx` |
| Shell nav | `web/components/shell/bottom-nav.tsx`, `navbar.tsx`, `header-toolbar.tsx`, `header-logo.tsx`, `profile-menu.tsx` |
| Data clients | `web/lib/leagues.ts`, `wagers.ts`, `wallet.ts`, `messaging.ts`, `notifications.ts`, `friends.ts`, `invites.ts`, `users.ts` |
