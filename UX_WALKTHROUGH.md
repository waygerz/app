# Waygerz — What You Can Do

> A plain-language, screen-by-screen tour of the app from **your** point of view:
> what you tap, what you see, and what happens. It covers the whole app — signing
> in, making it yours, friends and messages, running and playing leagues, betting
> head-to-head, and browsing sports.
>
> Where something isn't finished yet, you'll see a **Heads up** note so there are
> no surprises. (For the engineering view of every route, see
> `LAUNCH_CHECKLIST.md`; for the deep mechanics, the build plans in `.docs/`.)

---

## Getting around

Waygerz is built for your phone. At the bottom of the screen you always have five
tabs:

- **Leagues** — your home; every league you're in.
- **Bets** — all your head-to-head wagers.
- **Alerts** — your notifications (invites, bets, friend requests). A red dot
  shows how many are new.
- **Messages** — your chats. A red dot shows unread ones.
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

There are no passwords. You sign in with your phone number:

1. **Enter your phone number** and tap **Text me a code**.
2. **Type the 6-digit code** we send and tap **Continue**. Wrong number? Tap
   **Use a different number** to start over.
3. If you're new, you'll set up your account: **your name**, then agree to the
   **Terms of Service** and **Privacy Policy**, and finally choose whether you
   want **text alerts** and **promotional texts** (both optional — you can skip
   and change them later).

That's it — you're in.

> **Heads up:** text messaging isn't switched on yet, so during this early period
> your login code is shown right on the screen instead of being texted to you.

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
and add up to a set maximum. Your favorite teams travel with your account.

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
  weekly recap) across **text** and **in-app**. Turn the master off and texts
  pause across the board. (Your sign-in codes always come through.)
- **Promotions** — completely separate switches for promotional **texts** and
  in-app promos.

### Agreements & signing out

Your **Agreements** card shows the date you accepted the Terms and Privacy
Policy, with links to re-read them. To sign out, open the **Profile menu** and
tap **Sign out**.

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

## 4. Starting or joining a league

### Create a league

From **Leagues**, start a new one and walk through a short setup:

1. **Name it** and (optionally) add a logo.
2. **Pick the type** — **Pick'em** (free; just pick winners) or **Head-to-Head**
   (play-money wagering). This choice shapes everything after it.
3. **Choose the cadence** — **weekly** or **season-long**.
4. **Choose the sports** you'll follow (at least one).
5. **Money leagues only:** set the **starting balance** and the **min/max bet**.

Your league starts as a **Draft** with an invite link ready to share, and you as
the owner (commissioner).

### Activate it

A draft shows a **Draft** badge and an **Activate** button (owner only). Nothing
can be played until you activate. Activating a weekly Pick'em league sets up each
upcoming week and opens the first one; season and money leagues open a single
period.

### Invite people

From the league's **Invite / Share** button you can:

- **Copy the shareable link** — anyone who opens it sees a preview of your league
  (name, logo, member count) and a one-tap **Join**. If they're not signed in,
  they'll sign in first and then join automatically.
- **Invite friends directly** — they get a notification and an invite in their
  Alerts.

> **Heads up:** for now an invited person can accept but **can't decline** an
> invite, and the sender **can't cancel** one once it's out.

### Joining & your first look

When you join, you land on the league's **Overview** — a feed of announcements and
activity ("Marcus joined", "Week 3 is open", "🏆 …") that you can comment on and
react to, plus a nudge toward this week's games. In a money league, joining also
drops your starting **play-money balance** into your league wallet.

### Members & roles

The **Members** tab lists everyone with their role (**Owner / Moderator /
Member**). As owner you can promote or remove people, hand off ownership, and
archive the league. From any member you can also **Message** them or **Add** them
as a friend. Members can leave any time; the owner has to hand off or archive
first.

---

## 5. Playing Pick'em

*Free leagues where you pick winners. You'll use: Overview → My Picks → Results →
Standings.*

### Making your picks

On **My Picks**, choose the week (it defaults to the current one) and you'll see
that week's games. Tap the team you think will win in each game. The final game
of the week has a **tiebreaker** — predict the two teams' combined score.

- You can **change your picks** freely until they lock.
- Picks **lock about an hour before the first game** (and each game locks once it
  starts). After that they're frozen.
- Once games finish, each pick gets a **✓** or **✗**.

> **Heads up:** if a game is postponed or cancelled, that pick currently just
> shows as a miss without an explanation. And you won't get a reminder to make
> your picks yet — keep an eye on the week yourself.

### Results & standings

- **Results** shows the week's **leaderboard** — who got the most right, with the
  tiebreaker settling ties. Once picks lock, you can peek at what everyone else
  picked.
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
- **The stake** — an amount within the league's limits, or a **$0 "bragging
  rights"** bet (loser buys a beer).
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

You reach sports when setting up a league, and from the sports browser itself.

- **Pick a sport** from the grid.
- **Pick a league** within it. Tap the **star** on any league to **pin it** as a
  favorite for quick access.
- **See the games** you can bet on, and tap in to place a bet.

Some sports — golf, racing, MMA, cricket — work differently: instead of two-team
matchups you get **event pages** (leaderboards, fight cards, match summaries) with
an **"Upcoming only"** switch to hide past results.

> **Heads up:** those golf/racing/MMA/cricket event pages are **view-only** for
> now — you can't bet directly from them yet. Also note: the league **star** here
> is a quick device-only shortcut and is *separate* from the **Favorite teams** on
> your profile.

---

## 8. Staying in the loop

- **Alerts (Notifications)** — one place for league invites (**Join**), bet
  challenges (**Accept / Reject**), friend requests (**Accept / Decline**),
  reactions, and results. You can act on most of them right from the list; tapping
  one takes you to the details and marks it read. **Mark all read** clears the
  dot. What reaches you here (and by text) follows the switches in your Account.
- **Messages** — your chats, live and with read receipts (see Part 3).
- **Shared links** — every invite (league, friend, or bet) opens a clean preview
  page with the right button for you, whether you're signed in or not.
- **The league feed** — the social heart of each league: system moments (someone
  joined, a week opened, a bet settled) and members' own posts, all open to
  comments and reactions.

---

## 9. On your phone

Waygerz is phone-first, and native iOS and Android apps are on the way. They'll
do everything above — you'll get invite and bet links that open right in the app,
push notifications for reminders and results, and the same chats, leagues, and
betting. A couple of things (like your color theme carrying across devices) will
come together as the apps land.
