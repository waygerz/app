# Launch Checklist — webui Routes

Every user-facing page in `web/`, what it does, and the cards/tables/lists it
renders. Check each route off as it passes launch QA.

Route access is gated by `web/proxy.ts`:
- **Public** — no auth (shareable deep links)
- **Guest-only** — signed-in users are bounced home
- **App** — requires a session cookie

> **The core reused card is `WagerBetCard`** (`app/(app)/leagues/[id]/sections.tsx`).
> It renders on `/bets/[filter]`, `/leagues/[id]/play`, and `/leagues/[id]/results` —
> fix/QA it once and all three benefit.
>
> **Type-branching pages** (`/play`, `/results`, `/activity`, `/standings`) render
> differently for **Pick'em vs Head-to-Head** leagues — test each in *both* types.
>
> The only real HTML `<table>`s are `/activity` (transaction ledger) and the
> `ScheduleBoard` betting boards. Everything labeled "standings/leaderboard" is a
> **card list**, not a table.

---

## 🌐 Public (no auth — shareable deep links)

| ✓ | Path | Purpose | Cards / Tables / Lists | Data |
|---|------|---------|------------------------|------|
| ☐ | `/welcome` | Marketing landing (also what `/` rewrites to for signed-out visitors) | Hero + CTA, **feature cards** grid, "How it works" step cards, "Two ways to play" (H2H vs Pick'em) cards, FAQ accordion, footer — all static | none |
| ☐ | `/c/[code]` | Unified deep link — resolves a league (`L`), friend (`F`) **or** bet (`B`) code and renders the right preview + actions; guests bounce to login and replay after | One **Card**: league preview (Join/Rejoin) **·** friend preview (Add / Accept+Decline / already-friends → Dashboard) **·** bet challenge (proposer, matchup, your pick, stake, **Accept/Reject** — acceptor only). Invalid/consumed → message + Dashboard | `resolveCode` / `actOnCode` (`lib/invites.ts`) → leagues / friends / **contests** `/c/<code>` |

## 🔑 Guest-only (bounces signed-in users home)

| ✓ | Path | Purpose | Cards / Tables / Lists | Data |
|---|------|---------|------------------------|------|
| ☐ | `/login` | Passwordless phone→OTP 3-step wizard | One **Card** w/ stepped form (phone → code → profile), pending-link banner, dev OTP reveal box | `AuthContext` (startOtp/verifyOtp/completeProfile) |
| ☐ | `/signup` | Legacy — redirects to `/login` (preserves `?next`) | none (redirect) | none |

## 🔒 App (auth-required)

| ✓ | Path | Purpose | Cards / Tables / Lists | Data |
|---|------|---------|------------------------|------|
| ☐ | `/` | **My Leagues** home | Pending-invite **Cards** (accept); league **grid of Cards** (72px logo, type chip, member-avatar stack +N, Draft badge, unread-count badge); error/empty/skeleton states | `leaguesApi.list` / `.invites` / `.acceptInvite` |
| ☐ | `/bets` | Redirects to `/bets/all` | none | none |
| ☐ | `/bets/[filter]` | Wager ledger by tab (all/pending/accepted/completed…) | Bordered **list of `WagerBetCard`** rows (matchup, live/final score, pick chip, action column); `StatusIcon` locks; empty/skeleton | `wagersApi.all`, `leaguesApi.list`, `fetchEvent`; accept/decline/cancel/confirm/req+approve+reject-cancel |
| ☐ | `/account` | Account settings | Avatar **Card** (upload + recent-avatars grid), Display-name **Card**, Appearance **Card** (ColorPicker/SurfacePicker), NotificationsCard, read-only Phone **Card** | `mediaApi.myUploads` / `.upload`, `useAuth` |
| ☐ | `/friends` | Manage friends | Three **grids of `UserMiniCard`**: incoming requests, your friends (message + remove menu), pending sent; share-invite button; empty state | `friendsApi.list` / `.requests` / accept/decline/remove / inviteLink, `messagingApi.openDirect` |
| ☐ | `/sports` | Sport picker | **Grid of Cards** (emoji + name) linking into each sport | `fetchSports` |
| ☐ | `/sports/[slug]` | Leagues within a sport | League **Cards grid** (logo, season, tournament badge, favorite star) — OR `EspnSportList` for golf/racing/mma/cricket | `fetchLeagues(slug)`, favorites |
| ☐ | `/sports/[slug]/[externalId]` | Single ESPN tournament/race/fight detail | Delegates to `EspnEventDetail` (non-ESPN → "Not found") | inside `espn/event-detail` |
| ☐ | `/sports/[slug]/leagues/[league]` | Bettable events for a team-sport league | **Grid of `EventCard`**; back link; empty/error/skeleton | `fetchLeagueEvents(slug, league)` |
| ☐ | `/leagues/new` | Create a league | Single **form**: type selector, name, description, logo upload preview, period toggle, starting balance (money), sports picker chips | `leaguesApi.create`, `mediaApi.upload`, `fetchSports/Leagues` |

### League detail (`/leagues/[id]/…`)

| ✓ | Path | Purpose | Cards / Tables / Lists | Data |
|---|------|---------|------------------------|------|
| ☐ | `/leagues/[id]` | League home / social feed | Composer **Card** (mods), **feed list of `FeedPostCard`** (announcements/results, like+comment), right aside Description **Card** + `LeagueUpcomingGames` board, leave-league dialog | `leaguesApi.feed` / `.postFeed` / `.leave`, `commentsApi.engagement` |
| ☐ | `/leagues/[id]/play` | Play surface (type-aware) | **Pick'em**: week combobox + **grid of pick Cards** + save bar. **H2H**: three `BetSection` **lists of `WagerBetCard`** (Pending/Active/Awaiting) | `leaguesApi.periods/getPicks/submitPicks`, `wagersApi.mine`, `fetchPeriodEvents` |
| ☐ | `/leagues/[id]/results` | Settled outcomes by week | **H2H**: per-week **lists of `WagerBetCard`**. **Pick'em**: week combobox + **ranked member Cards** (medal, correct/total, tie-breaker) → MemberPicksDialog | `leaguesApi.periodResults` / `.confirmMember`, `wagersApi.mine` |
| ☐ | `/leagues/[id]/standings` | Season leaderboard | **List of standing Cards** (rank, avatar, W–L–P; money leagues add balance + net) | `leaguesApi.standings`, `formatCredits` |
| ☐ | `/leagues/[id]/activity` | Wallet ledger (money leagues) | Single Card wrapping a **transaction table** (type, signed amount, running balance, date); pick'em → redirect notice | `fetchTransactions('league:<id>')` |
| ☐ | `/leagues/[id]/schedule` | Legacy — redirects to `/play` | none | none |
| ☐ | `/leagues/[id]/members` | Roster + moderation | **Grid of `UserMiniCard`** (avatar, role, You badge; message/add-friend + actions menu: mod/commish/remove) | `leaguesApi.removeMember/setMemberRole/transferCommissioner`, `friendsApi.*` |
| ☐ | `/leagues/[id]/manage` | Commissioner control panel | Guard card; sticky sidebar nav; stacked cards: **Edit details form**, **Rules form** (min/max wager, who-proposes, tz), Period card, Danger-zone/archive | `leaguesApi.update/advancePeriod/archive`, `mediaApi.upload` |
| ☐ | `/leagues/[id]/sports` | Upcoming games hub, tap-to-bet | Pill-tab bar; team-sport **`ScheduleBoard` tables** (spread/total/winner) or field-sport **`EventCard` grid**; bet dialogs | `fetchUpcomingEvents`, `fetchLeagues`, wager dialogs |
| ☐ | `/leagues/[id]/sports/[sportLeagueId]` | One sport-league's schedule, tap-to-bet | Breadcrumb; single **`ScheduleBoard` table** (team) or **`EventCard` grid** + "opens tournament week" list (field); bet dialogs | `fetchUpcomingEvents`, `fetchEspnList` |

---

## Redirect stubs (render nothing — smoke-test the landing)

| ✓ | From | To |
|---|------|-----|
| ☐ | `/bets` | `/bets/all` |
| ☐ | `/signup` | `/login` (preserves `?next`) |
| ☐ | `/leagues/[id]/schedule` | `/leagues/[id]/play` |
