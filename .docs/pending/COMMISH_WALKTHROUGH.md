# Waygerz — Running Your League (Commissioner Guide)

> A plain-language tour of the app for the person **running** a league — the
> commissioner. It covers everything a regular player's guide doesn't: creating a
> league, activating it, inviting people, managing members and roles, keeping a
> Pick'em season or a money league moving, and the **Manage** tab.
>
> **Just playing, not running one?** The player's tour is
> [`MEMBER_WALKTHROUGH.md`](./MEMBER_WALKTHROUGH.md) — signing in, picks, bets,
> chat, and everything you do as a member. This guide assumes you've read that
> one; it only adds the commissioner layer on top.
>
> Where something isn't finished yet, you'll see a **Heads up** note. The
> **[Testing checklist](#-testing-checklist-commissioner)** at the end turns every
> control below into tick-box checks with expected results.

---

## Who's who — roles

Every league has three roles:

- **Commissioner (owner)** — you, if you created the league. Full control:
  settings, activation, members, roles, the **Manage** tab, archiving.
- **Moderator** — a helper you promote. Can post league updates, confirm Pick'em
  results, and remove **regular members** — but **cannot** open the Manage tab,
  change rules, transfer ownership, or preview picks early. Those stay with you.
- **Member** — everyone else; they play, they don't manage.

You **become a commissioner** the moment you create a league. There's exactly one
commissioner per league at a time, and you can hand the role to someone else.

### Your control center — the tabs

A league opens into its own set of tabs. Which you see depends on the league's
type; **Manage** is commissioner-only:

| Tab | Pick'em | Money (head-to-head) | Who |
|-----|:---:|:---:|-----|
| Overview (feed) | ✓ | ✓ | everyone |
| Sports | — | ✓ | everyone |
| Play ("My Picks" / "My Bets") | ✓ | ✓ | everyone |
| Results | ✓ | ✓ | everyone |
| Standings | ✓ | ✓ | everyone |
| Wallet | — | ✓ | everyone |
| Members | ✓ | ✓ | everyone (you manage) |
| **Manage** | ✓ | ✓ | **commissioner only** |

---

## 1. Create a league

From **Leagues**, tap to create a new one. It's a **single form** you fill top to
bottom (not a step-by-step wizard):

1. **League type** — two cards: **Head-to-Head** (play-money wagering — the
   default) or **Pick'em** (free; pick winners). **This one choice shapes
   everything after it** — the tabs, the play surface, whether there's a wallet.
   Treat it as permanent for the league.
2. **League name** (required) and an optional **Description** (shown on the invite
   preview page).
3. **League logo** (optional) — upload one, or leave it blank for a generated
   avatar.
4. **Period** — **Season** (the default; you also set a **season year**) or
   **Weekly**. For a **weekly money** league you also pick the **day the week
   resets on** (e.g. Tuesday); a **weekly Pick'em** league just follows the
   sport's real weeks.
5. **Starting balance per member** (money leagues only) — the play-money everyone
   gets. This is their **only** funds in the league.
6. **Sports** — pick at least one league from the catalog. These are the only
   games members can bet on / pick.

Submit and your league is created as a **Draft**, with a shareable invite link
ready and you installed as commissioner and first member.

> **Heads up:** you set the **starting balance** here, but the **min/max bet**,
> the **who-can-propose** rule, and the **timezone** are set **later in Manage →
> Rules** — not on this form.

## 2. Activate the league

A fresh league wears a **Draft** badge. Tap **Activate league** — the button sits
in the **league header** (commissioner only), *not* in Manage. **Nothing can be
played until you activate.** Activating:

- **Weekly Pick'em** → builds one period for each upcoming real week and opens the
  earliest one.
- **Season-long, or any money league** → opens a single period.

> **Heads up:** **weekly** is the fleshed-out path. Whether **season-long**
> Pick'em is a first-class launch mode is still an open question — favor weekly.

## 3. Invite & grow

Tap the league **logo** in the header to open its details dialog — that's where
the **Invite** button lives (it's also on the Draft header). Invite works one way
today:

- **Share the link** — your device's share sheet opens (or the link is copied).
  Anyone who opens it sees a preview of your league (name, logo, member count,
  who invited them) and a one-tap **Join**. If they're not signed in, they sign
  in first and then join automatically. The link is **reusable** — share it
  anywhere.

> **Heads up:** the share link is the **only** way to invite from the app right
> now. There is **no "pick a friend and send them an invite" button**, no
> per-friend one-time code, and no way to **revoke** a link. Invitees can accept
> but **can't decline**, and you **can't cancel** an invite once it's out.

## 4. Members & roles

The **Members** tab lists everyone with their role (**Commish / Moderator /
Member**). A search box appears once you pass **eight** members. From each member
(not yourself) you get **Message** and an **Add friend** button, plus a **⋮** menu
whose contents depend on your role:

**As commissioner you can:**

- **Make / remove moderator** on any non-commissioner member.
- **Transfer the commissionership** to another member — you become a **moderator**
  when you do (a confirm dialog warns you).
- **Remove** anyone but yourself.
- **Archive** the league (in Manage — see §7).

**Moderators** can remove **regular members** (not other mods or you) and help run
the league, but can't touch roles, Manage, or ownership.

Members can leave any time. **You can't just leave** as commissioner — you have to
**hand off ownership or archive** first. (The member's **Leave league** button is
at the bottom of the **Overview** tab.)

---

## 5. Running a Pick'em season

*The commissioner's side of the Pick'em loop. Members' picks/results/standings are
in the member guide; this is what only you touch.*

### Getting a slate in front of people

If a Pick'em league has **no periods yet**, the My Picks tab shows a **"Sync
schedule"** button — **commissioner only** (members just see "No weeks scheduled
yet."). Tap it to pull the real weeks in so people can pick.

### The weekly rhythm you're steering

```
You activate / a week opens  →  "Week N is open" posts to the feed  →
members pick  →  picks lock (~1h before kickoff)  →  games finish, picks
auto-grade  →  "🏆 <winner> took Week N" posts  →  the next week opens…
```

The next week opens automatically **when the current week finishes and rolls
over** — not on a fixed calendar date. If you need to move things along, you can
**Advance period** manually (Manage → Period, weekly money leagues).

### Confirming results

On **Results**, the leaderboard is computed automatically (correct picks,
tiebreaker settling ties). You and your **moderators** get a **green-check** on
each member row that **toggles** confirmed / unconfirmed (a dialog asks first).
Regular members see the same check as a **read-only** confirmed/not indicator.

> **Heads up:** the confirm check is **just a sign-off flag** — it does **not**
> gate grading, standings, payouts, or the winner announcement. Everything scores
> and rolls over on its own regardless.

> **More Pick'em heads-up:**
> - No season-ending **champion** moment yet — the league rolls week to week.
> - A **postponed/cancelled game** becomes a **no-contest** (dropped from records,
>   not a loss), but the app doesn't label it "voided" — the pick just looks
>   ungraded.
> - Members get **no reminder** to pick — the "Week N is open" feed post is the
>   only nudge.
> - **Only you** (the commissioner) can peek at members' picks before they lock;
>   moderators can't, even though they can confirm results.

---

## 6. Running a money (head-to-head) league

*The commissioner's side of the H2H loop. How members propose, accept, and settle
bets is in the member guide.*

> **This is play money, not real cash.** Everyone starts with the balance you set,
> and members wager it against each other.

### Bankrolls

When a member joins, they're automatically granted the **starting balance** you
chose at setup, into their league wallet. All the money in the league enters this
one way — through the join grant. There's a per-member **Wallet** tab showing the
balance, a weekly-net figure, and a full ledger (grants, holds, payouts, refunds).

### The rules you set — in Manage → Rules

- **Min / max bet** — bounds every real-stakes wager (a $0 "bragging rights" bet
  ignores them). Leave a field blank for "no limit."
- **Who can propose bets** — **Any member** or **Commissioner only**.
- **League timezone** — weeks roll over at **4:00 AM** in this zone.

### Settlement runs itself

Once a game is final, the system **auto-settles**: it reads the score, pays the
winner **double their stake**, and marks the bet **Settled** — nobody has to
confirm anything. A **push** or a **cancelled/unreadable** game **refunds** both
sides.

> **Heads up:**
> - Every bet is **even money** — the real betting line isn't priced in.
> - A member who **busts** has no re-buy, and there's **no "grant more credits"**
>   button — once the starting balances are out, that's the pool.
> - If a score truly can't be read, there's **no dispute or manual-grade** for you
>   to override it; it eventually void-refunds. (A vestigial "Confirm" button can
>   appear on a rare stuck bet, but normal bets never need it.)

---

## 7. The Manage tab

**Manage** (commissioner only — everyone else sees a lock screen) is a settings
page with a section rail. It holds more than you might expect:

- **League details** — change the **name**, **description**, **logo** (upload or
  remove), and the **sports** the league covers, after creation. Save applies
  immediately.
- **Rules** (money leagues) — **min/max bet**, **who can propose bets**, and the
  **league timezone / 4 AM rollover**. (Pick'em leagues have no wager rules.)
- **Period** (weekly, active leagues) — **Advance period** closes the current week
  now and opens the next; open bets settle as usual. A confirm dialog warns first.
- **Danger zone** — **Archive league**: it disappears from everyone's dashboard,
  but balances and history are preserved.

Remember: **Activate** is **not** here — it's the header button on a Draft league.
Only **Archive** lives in Manage.

---

## 8. Heads up — what's not finished (commissioner view)

A single list of the gaps that affect **running** a league:

- **Invites** — share link only; no targeted "invite this friend," no one-time
  codes, no revoke, and recipients can't decline.
- **Season-long Pick'em** — weekly is the real path; season is an open question.
- **Season end** — no champion/completion moment; leagues stay active indefinitely.
- **Voided games** — become a no-contest, but with no "voided" label for members.
- **Pick reminders** — none; the feed post is the only nudge.
- **Money leagues** — no re-buy for busted members, no "grant more credits," and
  no dispute/manual-grade when a score can't resolve.

---

## ✅ Testing checklist (commissioner)

> The commissioner layer only — the player-side checks (login, account, chat,
> betting, sports) live in the Member Guide's checklist. Tick each box; confirm
> the **→ Expect** result. **⚠** marks a spot that recently changed.

### Create a league  (`/leagues/new`)
- [ ] ⚠ It's a **single scrolling form**, not a wizard: **type → name → description
      → logo → period → (balance) → sports**.
- [ ] **Type** defaults to **Head-to-Head**; switching to **Pick'em** hides money
      settings.
- [ ] **Period** defaults to **Season** (+ year); **Weekly** money league shows a
      "Week resets on" day; weekly Pick'em follows the sport's real weeks.
- [ ] ⚠ Money form has **Starting balance only** — no min/max here.
- [ ] Sports: pick a sport tab → toggle league chips. **Create** disabled until name
      + ≥1 sport (+ balance > 0). Submit → toast + lands on the **Draft** league.

### Activate
- [ ] ⚠ **Activate** is the **header** button on a Draft league (not Manage), and
      commissioner-only.
- [ ] Weekly Pick'em → a period per upcoming week (earliest **open**, rest
      **upcoming**); season/money → one open period.

### Invite
- [ ] Tap the league **logo** → details dialog → **Invite** (also on the Draft
      header) → share sheet / copied `/c/L…` link.
- [ ] ⚠ Share link is the **only** invite path — no targeted send, no one-time code,
      no revoke; invitees can't decline.
- [ ] A second account joins via the link → lands on Overview; money league grants
      their starting balance; a "**<name> joined**" feed post appears.

### Feed, members & roles
- [ ] ⚠ The **composer** ("Post an update…") shows only to **commissioner/
      moderators**; posting appears as an **Announcement**.
- [ ] Members tab: search box past **8** members; per member **Message**, friend
      button, and a **⋮** menu.
- [ ] _(C)_ ⋮: **Make/Remove moderator**, **Transfer commissioner** (you become a
      moderator — dialog warns), **Remove from league**.
- [ ] ⚠ _(Mod)_ a moderator can **Remove a regular member** (not mods or you).
- [ ] As commissioner you have **no Leave button** on Overview — you must transfer
      or archive first.

### Pick'em admin
- [ ] ⚠ Empty Pick'em league → **"Sync schedule"** button, **commissioner-only**
      (members see "No weeks scheduled yet." with no button).
- [ ] Results: you + moderators get a **green check** that **toggles confirm/
      unconfirm** (dialog); members see it read-only.
- [ ] ⚠ Confirming changes **nothing** — grading/standings/payouts/winner run on
      their own. It's a sign-off flag.
- [ ] ⚠ Only **you** (not moderators) can preview members' picks before lock.

### Money-league admin
- [ ] Wallet grant lands automatically on join; ⚠ there's **no add-credits / re-buy**
      control anywhere.
- [ ] Set **Who can propose bets → Commissioner only** in Manage, then try to
      propose from a member account → blocked.
- [ ] ⚠ Stake outside min/max isn't blocked in the dialog but is **rejected
      server-side** (error toast).
- [ ] Settlement is automatic (no confirm); a busted member has no re-buy; no
      dispute/manual-grade when a score can't resolve.

### Manage tab  (`/manage`)
- [ ] Non-commissioner opens Manage → **lock screen**.
- [ ] **League details:** edit name/description, upload/remove logo, edit sports.
- [ ] **Rules** (money): min/max bet (blank = no limit), who-can-propose, timezone
      (4 AM rollover); Pick'em shows "no wager rules."
- [ ] **Period** (weekly active): **Advance period** → confirm → current week closes,
      next opens, bets settle.
- [ ] **Danger zone → Archive league** → confirm → redirect `/`, gone from
      dashboards (history preserved).

---

## Cross-references

- [`MEMBER_WALKTHROUGH.md`](./MEMBER_WALKTHROUGH.md) — the player's tour + its own
  checklist (read first)
- [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md) — route-by-route launch QA
- [`PICKEM_BUILD_PLAN.md`](../complete/PICKEM_BUILD_PLAN.md),
  [`H2H_BUILD_PLAN.md`](../complete/H2H_BUILD_PLAN.md) — the deep mechanics behind
  these flows
