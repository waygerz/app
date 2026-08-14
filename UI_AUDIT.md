# Waygerz webui — UI Standardization Audit

Working doc. Walk it top to bottom: **(1)** lock the standardization rules, **(2)**
read the per-page current-state table, **(3)** work the punch list. Checkboxes are
for you to tick as decisions land / fixes ship.

Reference template throughout is `app/(app)/friends/page.tsx`. Legend for the
Status column: ✅ compliant · ⚠️ minor drift · 🔧 needs work · ➖ N/A or intentionally exempt.

---

## Part 1 — Standardization decisions to lock

Each row is a dimension of the page contract. "Canonical" is the recommended
single value; the last column is who's off it today. Rows marked **DECISION** are
genuine forks — pick before the punch list.

### 1.1 Page container
- **Canonical (recommended): `container py-5 sm:py-8`** — this is already the de-facto
  majority (home, account, notifications, messages, bets, league layout, leagues/new).
- Off it: **friends** and all **sports/\*** pages use `container py-8` (the old
  template value). Two pages, one-line fixes.
- Exempt: guest/public pages (own full-screen layouts), the message **thread**
  (full-height chat), and the `[id]` **league layout** owns the container for all its children.
- [ ] **Lock `py-5 sm:py-8` as canonical**, fix friends + sports.

### 1.2 Page heading — ✅ **DECIDED: desktop-only h1 (a)**
Two conventions coexist:
- **(a) desktop-only** `<h1 className="hidden text-2xl font-bold text-foreground lg:block">`
  — the mobile title comes from `header-logo.tsx`. Used by friends, account, notifications, messages.
- **(b) always-visible** `<h1 className="text-2xl font-bold text-foreground">` (often + a subtitle `<p>`)
  — used by sports/\*, leagues/new, and the league layout (league name).

Pattern (a) avoids a double title on mobile **but only works if the route is registered
in `header-logo.tsx`** (`/`, `/bets`, `/account`, `/friends`, `/messages`, `/notifications`
are; sports/\* and leagues/new are **not**, which is why they use always-visible).

- **Recommendation:** adopt **(a) everywhere for top-level `(app)` pages** and register the
  missing routes (`/sports`, `/leagues/new`) in `header-logo.tsx`. Section pages inside a
  league keep the league name as the h1 (from the layout) and use `<h2>` for their own title.
- [x] **DECIDED → (a) desktop-only h1 everywhere for top-level `(app)` pages.** Register
      `/sports` + `/leagues/new` in `header-logo.tsx`; league section pages keep the layout's
      league-name h1 and use `<h2>` for their own title.

### 1.3 Section sub-heading (`<h2>`)
- Mixed sizing today: `text-base font-semibold` (play, manage) vs `text-lg font-semibold`
  (standings, members).
- **Canonical (recommended): `text-lg font-semibold text-foreground`** for section titles.
- [ ] Lock `h2` size, normalize play/manage/results.

### 1.4 Empty state — ✅ **DECIDED: `CenterCard` (icon + text) everywhere**
Four variants in the wild:
- Plain `Card p-6 text-center text-sm text-muted-foreground` (friends, members, bets)
- **`CenterCard`** = `Card items-center gap-2 p-6 text-center sm:p-10` + icon + text
  (most league sections: play, results, standings, activity, sports, manage gate)
- Richer icon-tile + CTA Card (home)
- Bare `<p>` in a hand-rolled bordered box (notifications, messages, sports/[slug], sports/leagues/[league])

- **Recommendation:** make **`CenterCard` (icon + text)** the one empty-state primitive.
  Promote it to a shared component (it currently lives in `leagues/[id]/sections.tsx`), give
  friends/members an icon, and kill every bare-`<p>` empty. Home's CTA card is a fair
  exception (it's the primary onboarding surface).
- [x] **DECIDED → `CenterCard` (icon + text) is the one empty-state primitive.** Promote it out
      of `leagues/[id]/sections.tsx` to a shared component, give friends/members an icon, and
      replace every bare-`<p>` empty (notifications, messages, sports/[slug], sports/leagues/[league])
      and the bets icon-Card with it. Home's onboarding CTA card stays as the one exception.

### 1.5 Loading state
- Mixed: `Skeleton` matching card geometry (home, bets, sports/\*, league sections) vs
  `Loading…` / `Loading messages…` muted text (friends, notifications, messages, c/[code]).
- **Canonical (recommended): `Skeleton`** shaped like the real content. Text-only loaders
  read as unfinished.
- [ ] Lock Skeleton, convert the four text loaders.

### 1.6 Card primitive
- **Rule: always compose `components/ui/card.tsx` (`Card` = `rounded-xl bg-card border shadow-xs`).**
- Hand-rolled `rounded-2xl border border-border bg-card` boxes exist in: notifications,
  messages, welcome. (welcome is marketing — lower priority.)
- [ ] Replace hand-rolled card boxes with `Card`.

### 1.7 List grid
- **Canonical for person/tile lists: `grid grid-cols-1 gap-4 lg:grid-cols-2`** (friends,
  members). Feeds / threads / settings stay single-column by design.
- [ ] Confirm which lists should be 2-up on desktop (candidates below in the table).

### 1.8 Roster search
- `ListSearch` gated at `> 8` entries — friends + members done. No other list currently
  qualifies (home league list is rarely >8; revisit if it grows).
- [ ] Leave as-is; add to a list only when it routinely exceeds ~8 rows.

### 1.9 Horizontal-scroll guard (mobile-first hard rule)
- Every table must sit in an `overflow-x-auto` wrapper. `ScheduleBoard` is wrapped in
  Overview but **NOT** on `/leagues/[id]/sports` or `/leagues/[id]/sports/[sportLeagueId]`.
- [ ] Wrap the two unguarded `ScheduleBoard` tables. (Real mobile h-scroll bug.)

### 1.10 Touch targets / inputs (mobile-first hard rule)
- ≥44px tap targets, ≥16px input text. `ListSearch` and login inputs already comply; spot-check
  dropdown/menu items and small icon buttons during the punch list.
- [ ] Spot-check per page.

---

## Part 2 — Per-page current state

### `(app)` — top level

| Page | Container | Heading | Cards | Loading | Empty | Mobile grid | Search | Status |
|---|---|---|---|---|---|---|---|---|
| `/` home | `py-5 sm:py-8` | h1 desktop-only, **`text-xl sm:text-2xl`** (off-size) | inline league rows + gradient bar, not shared card | Skeleton ✅ | icon+CTA Card (rich) | `flex-col` list | — | ⚠️ h1 size; bespoke rows |
| `/account` | `py-5 sm:py-8` + `max-w-2xl` | h1 desktop-only ✅ | many `Card` ✅ | none (`if(!user) return null`) | ➖ (form) | `max-w-2xl` col | — | ✅ |
| `/notifications` | `py-5 sm:py-8` + `max-w-2xl` | h1 desktop-only ✅ | **hand-rolled** `rounded-2xl` box | "Loading…" text | **bare `<p>`** | `max-w-2xl` col | — | 🔧 card + empty + loader |
| `/messages` | `py-5 sm:py-8` + `max-w-2xl` | h1 desktop-only ✅ | **hand-rolled** box + rows | "Loading…" text | **bare `<p>`** / CTA list | `max-w-2xl` col | — (Unread/Earlier groups) | 🔧 card + empty + loader |
| `/messages/[id]` thread | none (full-height chat) | in-thread header, no h1 | bubbles + inline `BetSlip` box | "Loading messages…" | `<p>` "Say hello!" | full-viewport chat | — | ➖ bespoke chat (intentional) |
| `/bets` | — | — | — | — | — | — | — | ➖ redirect → `/bets/all` |
| `/bets/[filter]` | (from layout) | (from layout) | `WagerBetCard` in bordered box; Card empty | Skeleton ✅ | **icon Card** ✅ | single-col table | URL/tab filter | ⚠️ empty is icon-Card not CenterCard |
| `/bets` layout | `py-5 sm:py-8` `min-w-0 w-full` | h1 via `hidden lg:flex` **wrapper** (not on h1) | pill filter nav | none | ➖ | nav `overflow-x-auto` ✅ | tab nav | ⚠️ heading pattern differs |

### `(app)` — sports

| Page | Container | Heading | Cards | Loading | Empty | Mobile grid | Search | Status |
|---|---|---|---|---|---|---|---|---|
| `/sports` | **`py-8`** | h1 **always-visible** + subtitle | `Card` tiles | Skeleton ✅ | none (list) | `grid-cols-1` | — | 🔧 container + heading |
| `/sports/[slug]` | **`py-8`** | h1 **always-visible** + subtitle | `Card` rows | Skeleton ✅ | **bare `<div>`** | `grid-cols-1` | — (favorites) | 🔧 container + heading + empty |
| `/sports/[slug]/[externalId]` | (in fallback only) | none | delegates `EspnEventDetail` | (delegated) | "Not found." | (delegated) | — | ➖ delegator |
| `/sports/[slug]/leagues/[league]` | **`py-8`** | h1 **always-visible** + subtitle | `EventCard` grid | Skeleton ✅ | **bare `<div>`** | `grid-cols-1` | — | 🔧 container + heading + empty |

### `(app)` — leagues (container + league-name h1 come from `[id]/layout.tsx`)

| Page → section | Root | Section heading | Cards | Loading | Empty | Mobile | Notes | Status |
|---|---|---|---|---|---|---|---|---|
| `[id]/layout.tsx` | `container py-5 sm:py-8` | h1 = league name, always-visible | avatar/badge/pill nav | `Skeleton h-40` | Card "not found" ✅ | header col→row; nav `overflow-x-auto` ✅ | shared shell | ✅ |
| `[id]` → overview | `flex-col gap-6` | — (h1 from layout) | `Card` + feed cards | none for feed | Card `p-8` + gradient icon | single col | `LeagueUpcomingGames` desktop-only | ✅ (3rd empty variant) |
| `[id]/play` → PickemPlay/H2H | `flex-col gap-4 pb-24` | h2 `text-base` | `Card` per game; fixed save bar | Skeleton ✅ | `CenterCard` | `grid-cols-1`; save bar ok | — | ⚠️ h2 size |
| `[id]/results` | `flex-col gap-4` (Suspense) | none (leads w/ week picker) | `Card` + `WeekWinnerCard` + `WagerBetCard` | Skeleton ✅ | `CenterCard` | single col | reads `?week=` | ⚠️ no section heading |
| `[id]/standings` | `flex-col gap-4` | h2 `text-lg` ✅ | `Card` rows (no table) | Skeleton ✅ | `CenterCard` | single-col rows ✅ | — | ✅ |
| `[id]/members` | `flex-col gap-4` | h2 `text-lg` | **`UserMiniCard` grid** | none (in payload) | **Card plain** ✅ | **`grid-cols-1 lg:grid-cols-2`** ✅ | **`ListSearch` >8** ✅ | ✅ best-aligned |
| `[id]/schedule` | — | — | — | — | — | — | redirect → play | ➖ stub |
| `[id]/activity` (nav: Wallet) | single `Card p-0` | none | balance hero + `TxnRow` list | Skeleton ✅ | `CenterCard` | one edge-to-edge card | — | ⚠️ no heading; unique shape |
| `[id]/manage` | `flex-col lg:flex-row` (sidebar) | per-card h2 `text-base` | scrollspy sidebar + `Card`s + `RulesForm` | none | `CenterCard` (non-commish gate) | sidebar hidden `<lg` ✅ | — | ⚠️ native `confirm()`; two-col unique |
| `[id]/sports` | `flex-col gap-4` | none (pill tabs) | `ScheduleBoard` **table** + `EventCard` | Skeleton ✅ | `CenterCard` | pills `overflow-x-auto` | pill-tab filter | 🔧 **ScheduleBoard NOT overflow-wrapped** |
| `[id]/sports/[sportLeagueId]` | `flex-col gap-4` | Breadcrumb + h2 `text-lg` | `ScheduleBoard` **table** + `EventCard` | Skeleton ✅ | `CenterCard` ×3 | `grid-cols-1` | — | 🔧 **ScheduleBoard NOT overflow-wrapped** |

### `(guest)` / `(public)` — intentionally outside the app shell

| Page | Container | Heading | Cards | Loading/Empty | Status |
|---|---|---|---|---|---|
| `/login` | full-screen `h-dvh` centered, `max-w-md` | brand h1, always-visible | single `Card` multi-step form | button busy states | ➖ exempt (own layout) |
| `/signup` | — | — | — | — | ➖ redirect → `/login` |
| `/c/[code]` invite | full-screen centered `max-w-md` | context h1, always-visible | `Card` interstitial | "Loading invite…" / custom `Dead` | ➖ exempt |
| `/welcome` | marketing `max-w-6xl` | hero h1 | **hand-rolled** `bg-card` divs | static | ➖ exempt (marketing); could use `Card` later |
| `/terms` | `max-w-2xl px-5 py-10 sm:py-14` | h1 always-visible | prose | static | ➖ exempt (legal doc) |
| `/privacy` | `max-w-2xl px-5 py-10 sm:py-14` | h1 always-visible | prose | static | ➖ exempt (legal doc) |

---

## Part 3 — Punch list

Grouped by fix type, cheapest/highest-confidence first. Blocked items depend on a
Part-1 decision — resolve those first.

### A. Hard mobile bugs (do first)
- [ ] Wrap `ScheduleBoard` in `overflow-x-auto` on `/leagues/[id]/sports` **and**
      `/leagues/[id]/sports/[sportLeagueId]` (§1.9). Real horizontal-scroll break on phones.

### B. Container normalization (§1.1 — one-liners)
- [ ] `/friends`: `container py-8` → `container py-5 sm:py-8`.
- [ ] `/sports`, `/sports/[slug]`, `/sports/[slug]/leagues/[league]`: `py-8` → `py-5 sm:py-8`.

### C. Card primitive + empty/loading cleanup (§1.4–1.6)
- [ ] `/notifications`: hand-rolled box → `Card`; bare `<p>` empty → chosen empty primitive; text loader → Skeleton.
- [ ] `/messages`: same three.
- [ ] `/sports/[slug]` and `/sports/[slug]/leagues/[league]`: bare `<div>` empty → chosen empty primitive.
- [ ] Promote `CenterCard` out of `leagues/[id]/sections.tsx` into a shared component **if** §1.4 = CenterCard-everywhere.
- [ ] Give `/friends` + `/leagues/[id]/members` empties an icon **if** §1.4 = CenterCard-everywhere.
- [ ] `/bets/[filter]`: reconcile its icon-Card empty with the chosen primitive.

### D. Heading normalization (§1.2 = desktop-only h1)
- [ ] `/` home: fix h1 to canonical `text-2xl` (drop `text-xl sm:text-2xl`).
- [ ] Register `/sports` + `/leagues/new` in `header-logo.tsx`, switch their h1s to desktop-only.
- [ ] `/sports/[slug]` + `/sports/[slug]/leagues/[league]`: these have dynamic titles (sport/league
      name) — either add param-aware cases to `header-logo.tsx` or keep an always-visible h1 as a
      documented exception (like the league-name h1). Decide during the pass.
- [ ] `/bets` layout: move `hidden lg:*` onto the h1 to match the chosen pattern.
- [ ] Section h2 sizing → `text-lg` on play, manage, results (add a section heading to results).

### E. Structural / lower priority
- [ ] `/manage`: replace native `confirm()` danger dialogs with `AlertDialog` (consistency + a11y).
- [ ] `/` home: decide whether league rows adopt a shared card primitive or stay bespoke.
- [ ] `/welcome`: migrate hand-rolled `bg-card` divs to `Card` (marketing, defer).
- [ ] Confirm 2-up (`lg:grid-cols-2`) candidates beyond friends/members (§1.7) — likely none.

### F. Sweep (per page, during the passes above)
- [ ] Touch targets ≥44px, input text ≥16px (§1.10) — check dropdown items and small icon buttons.
- [ ] No horizontal scroll on any page at 360px width.
- [ ] Loading + empty states present and on-primitive.
