# Waygerz UX Walkthrough — Leagues, Pick'em & H2H Betting

> **What this is.** A screen-by-screen, state-by-state narration of the actual
> user journey through leagues and both play modes as the app behaves **today**,
> grounded in the live webui (`web/app/(app)/leagues/`, `.../bets/`,
> `(public)/c/[code]`, `components/messages-sheet.tsx`). Companion to the
> gap-to-ship plans — where a screen is missing or half-built, it's flagged
> inline as **[gap → PICKEM Gx]** / **[gap → H2H Bx]** pointing at
> [`PICKEM_BUILD_PLAN.md`](./PICKEM_BUILD_PLAN.md) and
> [`H2H_BUILD_PLAN.md`](./H2H_BUILD_PLAN.md).
>
> The two modes share one container and one setup flow (**Part 1**); they diverge
> only at the play/results/money surfaces (**Part 2** Pick'em, **Part 3** H2H).
> Part 4 covers the cross-cutting surfaces (notifications, DMs, deep links).

---

## 0. The shell

Three route groups gate the whole app (`web/proxy.ts` middleware, keyed on the
`waygerz_access` cookie):

- **`(guest)`** — logged-out: `/login` (phone → OTP → profile/consent).
- **`(app)`** — authenticated: leagues, bets, wallet, messages, notifications.
- **`(public)`** — shareable deep links that render for logged-out visitors:
  `/c/<code>` (invite + bet links) and other `/p/…` share pages.

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

## Part 1 — Setup journey (shared by both modes)

### 1.1 Create a league — `/leagues/new` (`new/page.tsx`, the wizard)

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

### 1.2 The Draft state — activate

A freshly created league shows a **Draft** badge and an **Activate** button in
the header (commissioner only, `layout.tsx`). Until activated there are no
periods and no play. Activating:

- **Weekly Pick'em** → prebuilds one period per upcoming real ingestor week and
  opens the earliest.
- **Season / H2H** → opens a single period.

> **[gap → PICKEM G7 / decision]** Whether "season" Pick'em is a first-class
> launch mode is an open question; weekly is the fleshed-out path.

### 1.3 Invite & grow — the invite dialog + `/c/<code>`

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

### 1.4 Join — the member's first view

A new member lands on **Overview**: the league **feed** (announcements +
system activity like "Marcus joined", "Week 3 is open", "🏆 …") with inline
comments/likes (`feed-post.tsx`, backed by the comments service), plus a
**this-week widget** nudging them toward the play tab. For H2H, joining also
triggers a commissioner **credit grant** into their `league:{id}` wallet.

### 1.5 Members & roles — the Members tab

Roster with avatars and roles (**Commissioner / Moderator / Member**). The
commissioner can promote/demote moderators, transfer the commissionership
(old commish → moderator), remove members, and archive the league. A member can
leave (the commissioner cannot leave without transferring or archiving).

---

## Part 2 — Pick'em play loop

*Tabs used: Overview → My Picks → Results → Standings.*

### 2.1 My Picks — the weekly slate (`sections.tsx` `PickemPlay`)

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

### 2.2 Results — the weekly leaderboard (`PickemResults`)

Once a week rolls over, Results shows the **ranked leaderboard** for that week:
each member's correct-pick count, the tiebreaker column, and competition rank
(ties share a rank, broken by tiebreaker distance to the last game's actual
combined score). The commissioner/moderator gets a **green-check confirm button**
per member (`ConfirmMemberButton`). Members can peek at each other's picks via
`MemberPicksDialog` — but only **after** the slate locks (fails closed until 1h
before the first game; owner/commish see anytime).

### 2.3 Standings — the season view

Season-long **wins/losses** aggregated across every graded pick, ranked. This is
the running scoreboard across all weeks.

### 2.4 The lifecycle from the member's chair

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

## Part 3 — Head-to-Head betting loop

*Tabs used: Wallet → My Bets → Results, plus the propose flow that lives on the
schedule/matchup surfaces.*

### 3.1 Wallet — your league bankroll (Wallet tab)

Each H2H league has its own **play-money balance** (`league:{id}` account,
`wallet.ts` `formatCredits`). The tab shows the current balance and a
**transaction history** (grants, holds, payouts, refunds). Money enters only via
the commissioner's join-grant.

> **[gap → H2H B0]** This is **play money** — no real cash. Whether it ever
> becomes real money is the launch-gating decision. **[gap → H2H B4]** A member
> who busts has no re-buy-in, and the commissioner has no "grant more credits"
> button.

### 3.2 Propose a bet (`sections.tsx` — `ScheduleBetDialog` / `MatchupBetDialog`)

From a game on the league's schedule/matchup surface, a member opens the bet
dialog and sets:

- **The game** (an upcoming, `scheduled` event).
- **Bet type** — moneyline (pick the winner), spread (with a `line`), or total
  (over/under a `line`).
- **Stake** — an amount within the league's min/max… or **$0 "bragging rights"**
  (loser buys a beer), which bypasses the bounds.
- **Opponent(s)** — one or several co-members; each becomes an independent 1v1
  offer.

On submit the proposer's stake is **held** (debited immediately). The real line
from `event.odds` could be shown here as context — but today it isn't.

> **[gap → H2H B2]** Every wager is **strictly even-money** regardless of the
> real line; `event.odds` is ingested but not surfaced or priced in.

### 3.3 The bet arrives — three surfaces, one wager

A proposed bet reaches the opponent in three coordinated places:

1. **A DM bet card** (`messages-sheet.tsx` `BetSlip`) in the two players' direct
   thread — a rich card built from the message's own snapshot, with inline
   **Accept / Reject** buttons for the recipient. *(Per product rule, bets go to
   the 1:1 DM + notifications only — never the league group chat.)*
2. **A notification** (notifications sheet) with a `/c/B<code>` deep link.
3. **The `/c/B<code>` public page** (`(public)/c/[code]`) — an accept/decline
   preview that works even from a cold link.

### 3.4 Accept / decline / cancel

- **Accept** → the acceptor's stake is held too; the wager goes **accepted** and
  both bankrolls now show the money as committed. The DM card flips to "accepted"
  and the proposer is notified.
- **Decline** → proposer refunded, wager **declined**, DM card shows the outcome.
- **Proposer cancels** an un-accepted offer (>10 min before kickoff) → refunded.
- **Mutual cancel of a live bet** → one side **requests cancel**, the other
  **approves** (both refunded) or **rejects** (bet stands). Locked in the final
  10 minutes before start.

### 3.5 My Bets — the list (`bets/[filter]/page.tsx`)

The dedicated bets surface, filterable: **Pending / Active / Closed / Cancelled /
All** (`bets-common.tsx`). Sibling wagers — the same game/pick/stake offered to
several people — **collapse into one grouped card** (`groupWagers`) showing the
opponents together. Each card carries the contextual actions (accept, decline,
cancel, request/approve cancel).

### 3.6 Settlement — the payoff

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

### 3.7 The lifecycle from the bettor's chair

```
You propose ──► stake held; card lands in DM + notification + /c/ link
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

## Part 4 — Cross-cutting surfaces

- **Notifications sheet** (`notifications-sheet.tsx`) — invites, bet proposals,
  accepts. Honors the SMS/push opt-out prefs from the consent work. *Today it
  under-covers Pick'em* (no pick reminders, no results ping) **[gap → PICKEM
  G3]** and settlement pings for H2H are thin.
- **Messages sheet / DMs** (`messages-sheet.tsx`) — normal chat plus the native
  `BetSlip` bet cards with inline actions; reconciled against live wager state.
- **Deep links `/c/<code>`** — one public surface for both league invites (`L…`)
  and bets (`B…`), rendering a preview + the right CTA for logged-in/out and
  member/non-member viewers.
- **Feed + comments** — the league's social spine; system activity
  (joins, period open/final, wager accepted/settled) and member announcements,
  each commentable/likable.

---

## Part 5 — Mobile parity (Flutter iOS + Android)

Every surface above is served by the same REST API, so the native app reproduces
the *journeys*, not just the screens:

- **Bet-in-DM** is a native feature — the `kind:"bet"` message + `BetSlip` card
  with inline Accept/Reject must render in the Flutter thread from the message's
  `meta` snapshot (no second fetch needed).
- **`/c/<code>`** invite and bet links must resolve as **universal / app links**
  into native preview screens mirroring `(public)/c/[code]`.
- **Reminders & settlement** should reach **APNs/FCM push** (pending the
  notifications device-token work), not just the in-app sheet.
- **Locks & results** should be read from server state (period `status`, wager
  `status`) so the native client never re-implements the T-1h / kickoff math —
  another reason to land **PICKEM G2**.

---

## Appendix — screen ↔ code index

| Screen / surface | Code |
|---|---|
| Create wizard | `web/app/(app)/leagues/new/page.tsx` |
| League container + tabs | `web/app/(app)/leagues/[id]/layout.tsx` |
| Overview + feed | `[id]/page.tsx` → `overview.tsx`, `[id]/feed-post.tsx` |
| Pick'em play / results / standings | `[id]/sections.tsx` (`PickemPlay`, `PickemResults`, `LeagueStandings`) |
| H2H propose dialogs | `[id]/sections.tsx` (`ScheduleBetDialog`, `MatchupBetDialog`, `WagerBetCard`) |
| My Bets list | `web/app/(app)/bets/[filter]/page.tsx`, `bets-common.tsx` |
| Wallet | `web/lib/wallet.ts` + Wallet tab in `sections.tsx` |
| Deep-link preview | `web/app/(public)/c/[code]/page.tsx` |
| DMs / bet cards | `web/components/messages-sheet.tsx` |
| Notifications | `web/components/notifications-sheet.tsx` |
| Data clients | `web/lib/leagues.ts`, `wagers.ts`, `wallet.ts` |
