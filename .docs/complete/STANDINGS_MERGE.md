# Standings merge + tab renames

Status: **done** (2026-09-19) · Scope: web + mobile (no backend changes)

## Goal
One place for "how am I doing": merge **Results** into **Standings**, with week
chips plus an **Overall** chip. Shorten the play tab names.

## Tab names
| League type   | Before                                                                      | After                                                        |
|---------------|-----------------------------------------------------------------------------|--------------------------------------------------------------|
| Pick'em       | Feed · My Picks · Results · Standings · Members (· Manage)                  | Feed · **Picks** · **Standings** · Members (· Manage)        |
| Head-to-head  | Feed · Upcoming · Sports · My Bets · Results · Standings · Wallet · Members (· Manage) | Feed · Upcoming · Sports · **Bets** · **Standings** · Members · Wallet (· Manage) |

## Standings tab
**Chip row:** `HF · P1 · P2 · W1 · W2 … · Overall`
- Week chips use `shortPeriodLabel` (existing, same rules web + app).
- **Overall** sits last and looks distinct (trophy icon), so it isn't read as a week.
- The selected chip scrolls into view (existing WeekChips behaviour).

**Default selection:** the current (open) week. *(Decision: confirm vs. Overall.)*

**Week chip** (today's Results content):
- Title: `Standings · Week 2`
- Pick'em subtitle: `5 of 16 games final · 11 left` / `All 16 games final.`
- Pick'em body: winner card (once the week is final), leaderboard (correct/total,
  tie-breaker, confirmations), tap a member for their picks.
- H2H subtitle: `N settled bets`
- H2H body: the week's reckoning ($ / 🍺 / 🥃, overall + per opponent) + settled bet cards.
- H2H chips: only weeks that have settled bets, plus `Other` for bets with no week.

**Overall chip** (today's Standings content):
- Title: `Standings · Overall`
- Subtitle: `12 members · after Week 2` (current period label)
- Body: season table (server rank, W–L; balance + net for money leagues).

## Deep links / URLs (web)
- `/leagues/<id>/standings?week=<index>` → that week; `?week=overall` or no param → default.
- `/leagues/<id>/results` → redirect to `/leagues/<id>/standings` (keeps old links working).
- The play tab route is unchanged (`/leagues/<id>/play`); only the label changes.

## Work items
### Web
- [x] `leagues/[id]/layout.tsx`: tab list — remove Results, rename play tab (Picks/Bets).
- [x] `_sections/standings.tsx`: host WeekChips + Overall; render the week view (moved
      from `results.tsx`) or the season table; `?week=` param (reuse `useWeekParam`).
- [x] `_sections/results.tsx`: fold into standings (keep the pick'em + H2H week views as
      components); delete the Results route or redirect it.
- [x] `components/week-chips.tsx`: optional trailing "Overall" chip (icon + distinct style).
- [x] Page titles (`header-logo` pageTitle, any "My Picks"/"My Bets" copy).
### Mobile
- [x] `league_detail_screen.dart`: sections — drop `results`, rename play labels.
- [x] `league/results_tab.dart` → merged `StandingsTab` (week views + Overall table,
      moved from `_StandingsTab`).
- [x] `ui/week_chips.dart`: trailing Overall chip.
- [x] AppNav: route `/leagues/<id>/results` + `/standings` to the merged tab.
### Tests
- [x] Mobile: widget-level not required; keep `shortPeriodLabel` tests.
- [x] Web: lint/tsc/build clean.

## Out of scope
- Backend: none (same endpoints: periods, period results, standings, wagers).

## Rollout
Commit → CI → deploy **webui** when approved; mobile ships with the next APK/TestFlight build.

## Decisions
1. Default chip: the current (open) week. Head-to-head, whose chips are only
   weeks with settled bets: the current week if it has results, else the newest
   week with results, else Overall.
2. Overall chip: trophy icon + primary outline (filled when selected).

## As built
- Web: `_sections/standings.tsx` (ex `results.tsx`) hosts the chips + week views;
  `_sections/season-table.tsx` (ex `standings.tsx`) is the Overall table;
  `?week=<index>|overall|other`; `/results` redirects to `/standings` (keeps `?week`).
- Mobile: `league/standings_tab.dart` (ex `results_tab.dart`) + `league/season_table.dart`;
  `LeagueSection` is public and `AppNav` opens `/leagues/<id>/<tab>` links on that tab.