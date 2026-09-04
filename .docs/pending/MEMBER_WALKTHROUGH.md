# Waygerz — What You Can Do

> A plain-language, screen-by-screen tour of the app from **your** point of view:
> what you tap, what you see, and what happens. It covers the whole app — signing
> in, making it yours, friends and messages, running and playing leagues, betting
> head-to-head, and browsing sports.
>
> Where something isn't finished yet, you'll see a **Heads up** note so there are
> no surprises.
>
> The **[Testing checklist](#-testing-checklist-member)** at the end of this file
> turns every screen below into tick-box checks with expected results.
>
> **Running a league?** The commissioner's companion is
> [`COMMISH_WALKTHROUGH.md`](./COMMISH_WALKTHROUGH.md) — creating, activating,
> inviting, and managing a league (with its own checklist). Route-by-route infra
> QA lives in [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md).

---

## Getting around

Waygerz is built for your phone. At the bottom of the screen you always have five
tabs:

- **Leagues** — your home; every league you're in.
- **Bets** — all your head-to-head wagers.
- **Alerts** — your notifications (invites, bets, friend requests). A red count
  badge shows how many are new (it caps at **9+**).
- **Messages** — your chats. A red count badge shows how many have unread messages.
- **Profile** — your photo; tap it for **Account**, **Friends**, a **light/dark**
  switch, and **Sign out**.

Tap into a league and it opens with its own set of tabs. Which tabs you see
depends on the league's type:

| Tab | Pick'em league | Money league (head-to-head) |
|-----|:---:|:---:|
| Overview (feed) | ✓ | ✓ |
| Sports (games to bet) | — | ✓ |
| Play ("My Picks" / "My Bets") | ✓ | ✓ |
| Results | ✓ | ✓ |
| Standings | ✓ | ✓ |
| Wallet | — | ✓ |
| Members | ✓ | ✓ |
| Manage (owner only) | ✓ | ✓ |

---

## 1. Getting started — signing in

There are no passwords. You sign in with your phone number, and we text you a
one-time code.

**If you already have an account:**

1. **Enter your phone number** and tap **Continue**.
2. **Type the 6-digit code** we text you and tap **Continue**. Wrong number? Tap
   **Use a different number** to start over.

That's it — you're in.

**If you're new,** creating an account adds a couple of steps:

1. **Enter your phone number** and tap **Continue**.
2. **Agree to texts.** Because the sign-in code is itself a text, we confirm your
   consent first. Check the box to receive **account & sign-in texts** — this one
   is **required** (without it we can't text you the code). A second box for
   **promotional texts** is **optional**. Tap **Agree & text me my code**.
3. **Type the 6-digit code** and tap **Continue**.
4. **Tell us your name** (Step 1 of 2), then **agree to the Terms of Service and
   Privacy Policy** (Step 2 of 2 — both required). Tap **Create my account**.

> **Heads up:** if you've previously texted **STOP** to opt out of our texts,
> you'll need to text **START** first so we can send your sign-in code.

**Opening a shared link before you're signed in.** If a friend sends you an
invite (to a league, a bet, or to be friends) and you're not signed in yet,
you'll see a little banner telling you what's waiting — "Log in to join
**<league>**", for example. Once you finish signing in, you land right on that
invite, ready to accept.

---

## 2. Making it yours — your profile & settings

Everything here is under **Profile → Account**. This is where you change your
photo, your name, your colors, and your alerts.

### Your photo (avatar)

Tap the big circle to pick a photo, or just **drag an image onto it**. It's
cropped to a neat square automatically. Changed your mind? A small **✕** clears
it back to your initials. Your recent photos stay in a row underneath, so you can
switch back to an old one with a single tap — no re-uploading.

### Your name & phone

Change your **display name** any time and tap **Save**. Your **phone number** is
shown but locked — it's how you sign in, so it can't be changed here for now.

### Favorite teams

Add the teams you follow and they show up as colorful pills on your profile. Tap
**+ Add team**, then drill down **sport → league → team** (there's a search box
to find one fast). You can mark one team as your **Primary**, remove any of them,
and add up to **six**. Your favorite teams travel with your account.

### Colors & dark mode (Appearance)

Make the app look the way you like:

- **Colors** — pick a **primary** color and an **accent** color from a rainbow of
  seven each. The whole app re-themes instantly.
- **Dark shade** — if you use dark mode, choose from four background styles
  (Slate, Soft, Lifted, Flat) to set how dark and contrasty things feel.
- The **light/dark switch** itself lives in the **Profile menu**.

> **Heads up:** your color and dark-mode choices are saved on *this device* for
> now — they don't yet follow you to another phone or computer.

### Text & promotional alerts

Two separate cards let you control what reaches you by text and in the app:

- **Notifications** — a master switch for **text alerts**, plus fine-grained
  control over each kind (bets, league invites, friend requests, reactions,
  weekly recap) across **text** and **in-app** — except **reactions**, which are
  in-app only. Turn the master off and texts pause across the board. (Your sign-in
  codes always come through.)
- **Promotions** — completely separate switches for promotional **texts** and
  in-app promos.

### Agreements & signing out

Your **Agreements** card shows the date you accepted the Terms and Privacy
Policy, with links to re-read them. To sign out, open the **Profile menu** and
tap **Sign out**.

### Deleting your account

At the bottom of **Account** is a **Delete account** option, set apart in a red
"danger zone." Deleting is permanent: you confirm by typing **DELETE**, and then
your profile and personal details are removed and you're signed out. Shared
history that other people still see — past bets and messages — is kept but no
longer shows your name. If you're the **commissioner of an active league**, you
can't delete yet: the app lists those leagues and asks you to **hand them off or
archive** them first.

---

## 3. Friends & messages

### Friends

Open **Profile → Friends**:

- **Add friends** — tap **Add Friends** to share your personal invite link
  however you like (text, chat, etc.). Whoever opens it can add you.
- **Requests** — anyone who wants to connect shows up at the top; tap **Accept**
  or **Decline**.
- **Your friends** — each friend has a **Message** button (jumps straight into a
  chat) and a menu to **Remove** them. Once you have a lot of friends, a search
  box appears to filter them.

### Anyone's profile

Tap a person's **photo or name** where it appears — in your friends list or a
league's Members tab — and their profile card opens: your **head-to-head record**
against them, the **bets you've had together**, and their **favorite-team** pills.

### Messages

Open the **Messages** tab for all your chats — direct messages with friends and
group chats for your leagues.

- Unread conversations rise to the top under **Unread**, marked with a colored bar
  and a count. Tap **Mark all read** to clear them.
- Brand new and nothing there yet? You'll see quick buttons to **start a chat**
  for any league you're in.

Open a conversation to chat:

- **Type and send** (the return key works too). Messages appear instantly.
- You'll see when the other person is **typing**, and — in direct messages — a
  **double-check** once they've read yours. New messages arrive live without
  refreshing.
- In league group chats, each person's messages are labeled and color-coded, with
  day dividers.
- The **back arrow** returns you to your inbox.

---

## 4. Joining and being in a league

### Want to run your own?

Anyone can **start a league** from the **Leagues** tab — and doing so makes you
its commissioner. Setting one up, activating it, inviting people, and managing
members is its own job, covered in the
**[Commissioner Guide](./COMMISH_WALKTHROUGH.md)**. This section is about being a
**member** of a league someone else runs.

### Joining a league

You join one of two ways:

- **A shared link** — someone sends you the league's link; you'll see a preview
  (name, logo, member count) and a one-tap **Join**. Not signed in yet? You sign
  in first and then join automatically.
- **A direct invite** — it arrives in your **Alerts** with a **Join** button.

> **Heads up:** for now you can accept an invite but **can't decline** it, and the
> person who sent it **can't cancel** it once it's out.

### Your first look

When you join, you land on the league's **Overview** — a feed of announcements and
activity ("Marcus joined", "Week 3 is open", "🏆 …") that you can comment on and
react to, plus a nudge toward this week's games. In a money league, joining also
drops your starting **play-money balance** into your league wallet.

### Members & roles

The **Members** tab lists everyone with their role (**Owner / Moderator /
Member**). From any member you can **Message** them or **Add** them as a friend.
You can **leave** a league any time — unless you're the commissioner, who has to
hand off or archive it first (see the Commissioner Guide).

---

## 5. Playing Pick'em

*Free leagues where you pick winners. You'll use: Overview → My Picks → Results →
Standings.*

### Making your picks

Your league's **Overview** has a **"This week"** card — how many of your picks are
in, when they lock, and a shortcut straight to your picks. Tap it (or the **My
Picks** tab) to play.

On **My Picks**, choose the week (it defaults to the current one) and you'll see
that week's games. Tap the team you think will win in each game. The final game
of the week has a **tiebreaker** — predict the two teams' combined score. Tap
**Save picks** when you're done.

- You can **change your picks** freely until they lock (each save re-grades).
- Picks **lock about an hour before the first game**. After that the slate is
  frozen.
- Once games finish, each pick gets a **✓** or **✗**.

> **Heads up:** if a game is postponed or cancelled, that pick becomes a
> **no-contest** — it doesn't count for or against you (it's dropped from your
> record), but the app doesn't label it as voided, so the pick just looks
> ungraded. And you won't get a reminder to make your picks yet — keep an eye on
> the week yourself.

### Results & standings

- **Results** shows the week's **leaderboard** — who got the most right, with the
  tiebreaker settling ties, and a **winner card** at the top once the week is
  final (ties show co-winners). From about an hour before the first game (once
  picks lock), you can tap anyone to **peek at what they picked** — before that
  it's hidden.
- **Standings** is the season-long scoreboard — total wins and losses across every
  week.

**The rhythm of a week:**

```
Week opens  →  you pick  →  picks lock (~1h before kickoff)  →
games finish, picks auto-grade  →  "🏆 <winner> took Week N" posts to the feed  →
next week opens…
```

> **Heads up:** there's no season-ending "champion" moment yet — the league just
> rolls on.

---

## 6. Head-to-head betting

*Money leagues where you challenge other members. You'll use: Wallet → My Bets →
Results, plus the games list to start a bet.*

> **Good to know:** this is **play money**, not real cash. Everyone starts with a
> balance the owner grants; you bet against each other with it.

### Your wallet

The **Wallet** tab shows your league balance and a history of everything that's
happened to it — your starting grant, money held on active bets, payouts, and
refunds.

### Making a bet

From a game on the league's **Sports** list, open the bet and choose:

- **The game.**
- **The type** — pick the **winner**, bet a **spread**, or bet the **total**
  (over/under).
- **The stake** — quick chips: **Beer** (a **$0** bragging-rights bet — loser buys
  the round), **$10**, **$20**, or a **custom** amount. Real-money stakes have to
  land within the league's min/max.
- **Who you're challenging** — one member or several (each becomes its own 1-on-1
  bet).

Your stake is set aside the moment you send it.

> **Heads up:** every bet is **even money** right now — the real betting line
> isn't factored into the payout.

### When you're challenged

A bet someone sends you shows up in two places: your **Alerts** (with **Accept**
and **Reject** right there) and as a **shareable link** that works even if you
tap it cold. It also appears in your **My Bets** under **Pending**.

- **Accept** and both stakes are locked in; the bet is live.
- **Reject** and the challenger gets their money back.
- The challenger can **cancel** an unanswered bet (up until shortly before
  kickoff) for a refund.
- To back out of a *live* bet, one side **requests a cancel** and the other
  **approves** (both refunded) or **declines** (bet stands) — locked in the final
  ten minutes before the game.

### Your bets list

**My Bets** shows everything, filterable by **Pending / Active / Closed /
Cancelled / All**. If you challenged several people to the same bet, they're
grouped into one card so it stays tidy. Each card has the buttons that make sense
for where the bet is.

### Getting paid

You don't have to do anything — once a game goes final, bets settle themselves:

- **You won** → you're paid **double your stake**, and the card shows **Settled
  +$X**.
- **Push** (a tie against the spread/total) → everyone gets their money back.
- **Game cancelled or never resolved** → everyone gets their money back.

**The rhythm of a bet:**

```
You send it  →  it lands in their Alerts + a link + your My Bets  →
they accept (both stakes locked)  →  game plays  →  game ends, it auto-settles  →
winner paid double / push refunds both  →  result on the card
```

> **Heads up:** if a game's result can't be found, the bet quietly refunds after a
> few hours — there's no dispute or manual "call it" option yet, and no receipt
> explaining exactly how a bet paid out.

---

## 7. Browsing sports & events

The sports browser (from the **Sports** menu) is a place to **look around** — it
also drives league setup. It's read-only:

- **Pick a sport** from the grid.
- **Pick a league** within it. Tap the **star** on any league to **pin it** as a
  favorite for quick access.
- **Browse the upcoming games** and their lines.

To actually **place a bet**, go **inside one of your money leagues**: its
**Sports** tab (and the "Upcoming games" board on the league Overview) is where
you tap a game to challenge someone. The standalone browser above never places
bets.

> **Heads up:** the league **star** here is a quick **device-only** shortcut and
> is *separate* from the **Favorite teams** on your profile. And the individual-
> sport event pages (golf, racing, MMA, cricket) are **temporarily unavailable**
> while we rework them — for now you'll only see the regular team sports.

---

## 8. Staying in the loop

- **Alerts (Notifications)** — one place for league invites (**Join**), bet
  challenges (**Accept / Reject**), friend requests (**Accept / Decline**),
  reactions, and results. You can act on most of them right from the list; tapping
  one takes you to the details and marks it read. **Mark all read** clears the
  badge. What reaches you here (and by text) follows the switches in your Account.
  (If a bet offer expires or the game starts before you act, its buttons turn into
  a greyed-out **"No longer available."**)
- **Messages** — your chats, live and with read receipts (see Part 3).
- **Shared links** — every invite (league, friend, or bet) opens a preview page
  with the right button for you. If you're **not signed in**, the link sends you
  to sign in first (with a banner showing what's waiting) and drops you back on it
  right after.
- **The league feed** — the social heart of each league: system moments (someone
  joined, a week opened, a bet settled) plus updates posted by the league's
  **commissioner or moderators**. Everyone can **comment** and **react** (seven
  reactions — tap the count to see who reacted).

---

## 9. On your phone

Waygerz is phone-first, and native iOS and Android apps are on the way. They'll
do everything above — you'll get invite and bet links that open right in the app,
push notifications for reminders and results, and the same chats, leagues, and
betting. A couple of things (like your color theme carrying across devices) will
come together as the apps land.

---

## ✅ Testing checklist (member)

> Walk the app and tick each box; confirm the **→ Expect** result. **⚠** marks a
> spot that recently changed — worth extra attention. Commissioner controls have
> their own checklist in the Commissioner Guide.

### Before you start
- [ ] Two accounts / phone numbers ready (needed for friends, DMs, and both sides
      of a bet).
- [ ] The sign-in code now arrives by **real SMS** — the old on-screen **"Testing
      code"** box is gone. Use a phone number that can receive texts.
- [ ] Run each area at **mobile width** (bottom nav + header title) **and** desktop
      `lg+` (top bar + in-page heading).

### Signing in
- [ ] `/` signed out → rewrites to the **/welcome** page; **Sign in / Get started**
      → `/login`.
- [ ] `/signup` → redirects to `/login`.
- [ ] Phone auto-formats `(904) 555-1234`; **Continue** sends the code.
- [ ] **Existing** number → straight to the **code** step; **← Use a different
      number** resets.
- [ ] **New** number → a **consent card first**: the **account & sign-in texts** box
      is **required** (the **Agree & text me my code** button stays disabled until
      it's checked); the **promotional texts** box is optional.
- [ ] After the code, a new account → **Step 1 Name → Step 2 Terms & Privacy** (both
      boxes required) → **Create my account**.
- [ ] Opted-out number → error prompting to text **START** first.
- [ ] Signed-out share link → `/login` with a banner ("Log in to join" / "…connect"
      / "…answer your bet"); after login you land on the link.

### Account & personalization  (`/account`)
- [ ] Avatar: click/drag to upload (square crop + toast); a non-image → error toast;
      **✕** clears; a **Recent** row lets you reuse without re-upload.
- [ ] Display name **Save** (disabled until changed); phone is read-only.
- [ ] Favorite teams: **N/6** counter; add via **sport → league → team** picker;
      **Maximum reached** at 6; Primary/remove; persists across devices.
- [ ] Appearance: Primary + Accent colors re-theme instantly; Dark shade changes
      dark mode only. ⚠ Colors are **device-local** (don't follow to another device).
- [ ] Notifications master SMS toggle disables the SMS column; ⚠ **Reactions** SMS
      cell is a **"—"**. Promotions card is independent.
- [ ] Light/dark toggle is in the **Profile menu**, not the Appearance card.

### People
- [ ] Add Friends (share link) → other account opens it → **Requests** row with
      **Accept/Decline**; Accept → both listed.
- [ ] **Message** a friend → opens the DM. **⋮ → Remove friend** (confirm).
- [ ] Search box appears past **8** friends. ⚠ **Pending sent** rows have **no
      cancel**.
- [ ] Tap a person's **avatar/name** → profile dialog (head-to-head record, shared
      bets, favorite-team pills). Your own avatar in nav does **not** open it.
- [ ] Messages inbox: **Unread/Earlier** groups; **Mark all read** drops the nav
      badge; empty state offers **Start a league chat** per league.
- [ ] Thread: send via button **and** Enter; opening marks read; live arrival +
      **typing** dots; **direct** chats show a **read-receipt** check; league chats
      color senders + day dividers. ⚠ No in-thread bet card; ⚠ can't edit/delete
      your own message from web.

### Notifications & links
- [ ] Inline actions: bet **Accept/Reject**, league **Join/Dismiss**, friend
      **Accept/Decline**; acting resolves in place + marks read.
- [ ] ⚠ League **Dismiss** does nothing server-side (can't truly decline).
- [ ] ⚠ Stale offer (game started/expired) → actions become a disabled **"No longer
      available"**, row not clickable.
- [ ] **Mark all read** clears the **Alerts** badge.
- [ ] `/c/…` variants signed in: already-member/rejoin/already-friends/request-sent/
      self-link/not-addressed each show the right message; consumed/expired/invalid
      show a dead-state.

### Getting around
- [ ] Bottom nav = **Leagues, Bets, Alerts, Messages, Profile**; Alerts/Messages
      badges are **numeric `9+` chips**, not dots.
- [ ] Desktop top bar = Leagues + Bets, plus Messages/Bell/avatar; Sports & Friends
      aren't top-level.
- [ ] Header title matches the route; chat threads & league detail render their own.

### Joining a league
- [ ] Open a league link as a non-member → preview + **Join** → lands on
      **Overview**; a money league drops your **starting balance** into the Wallet.
- [ ] ⚠ You can accept an invite but **can't decline**; the sender can't cancel.
- [ ] ⚠ Only **commissioner/moderators** can post to the feed — you can comment &
      react (7 reactions; tap the count for who reacted) but have no post box.
- [ ] **Leave league** at the **bottom of Overview** → confirm → back to dashboard.

### Playing Pick'em
- [ ] Overview **"This week"** widget shows picked/total + lock countdown + CTA.
- [ ] My Picks: week combobox defaults to the open week; tap a team per game; last
      game has a **tiebreaker**; **Save picks** → toast; re-saving re-grades.
- [ ] ⚠ A point spread shows on each card even in free Pick'em (info only).
- [ ] Within ~1h of first kickoff the slate **locks** in the UI. Finished games show
      **✓/✗**.
- [ ] ⚠ Postponed/cancelled game → **no-contest**: no ✓/✗, ungraded look, excluded
      from your record (not a loss).
- [ ] Results: leaderboard + a **winner card** when final (ties → co-winner
      chooser). Tap a row → that member's picks. ⚠ Opponents' picks are **hidden
      until ~1h before** the first game.
- [ ] Standings: season **W–L** across all graded picks. ⚠ No season-end champion.

### Head-to-head betting
- [ ] Bet only from **inside a money league** (Sports tab / Overview board) — tap a
      game → dialog: **Winner/Spread/Total**, stake chips (**Beer $0 / $10 / $20 /
      Custom**), then **one or more opponents** → **Bet (N)**; your stake is **held**.
- [ ] Opponent sees it in **Alerts**, on the `/c/B…` link, and **My Bets → Pending**.
      **Accept** (both held, goes Active) / **Reject** (refund).
- [ ] Proposer **Cancel** (un-accepted, refund) disappears ~10 min before start;
      live-bet **mutual cancel** (request → approve/reject), locked final 10 min.
- [ ] ⚠ **Settlement is automatic:** game final → winner paid **2×**, card shows
      **Settled +$X**; push/cancel **refunds** both. **No "Confirm" needed.**
- [ ] Wallet ledger shows grant / hold / payout / refund with running balance;
      Results tab shows a **reconciliation** (net $, net 🍺, per-opponent).
- [ ] Global `/bets`: filter pills All/Active/Pending/Closed/Cancelled with counts;
      sibling bets group into one card; tap a card → read-only details.

### Browsing sports
- [ ] ⚠ `/sports` is **read-only** — no bet entry anywhere in the browser.
- [ ] A league **star** pins it (device-local, separate from favorite teams).
- [ ] ⚠ Golf/racing/MMA/cricket are **temporarily disabled** — gone from the grid;
      their detail pages render **"Not found."**

### Launch-risk spot-checks  ⚠
- [ ] `/terms` and `/privacy` render real copy under the **Waygerz** name — the old
      `[amount, e.g. USD $100]` placeholder, the "draft, not reviewed by counsel"
      banner, and the **"Wagerz, Inc."** entity typo are gone. (Final legal review
      still pending.)
- [ ] **In-app account deletion exists** (Account → **Delete account**): type-DELETE
      confirm; blocked while you commission an active league (it lists them); then
      purges your data and signs you out. (Both app stores require this.)
