# UI improvements

Status: planned · Scope: web + mobile (no backend changes) · Owner: TBD

## Goal
Make the UI look more modern, consistent and native on phones. Web and app
should look and behave the same. Each item below says what's wrong today,
what to change, and where the work is.

## Order
1. **Design tokens** (#4). Everything else builds on it.
2. **Control hierarchy** (#1) + **compact league header** (#2). These change how every league screen feels.
3. **Bottom sheets** (#3), **touch targets** (#5), **game-row clarity** (#6).
4. **Surfaces and contrast** (#7), **feedback and motion** (#8), **accessibility** (#9).

---

## 1. One control style per job
**Today:** league tabs, the Today/This week toggle, sport filters and week chips
are all rounded pills. On Upcoming that means three rows of look-alike buttons
with no clear hierarchy.

**Change:**
| Job | Control |
|---|---|
| Section navigation (league tabs) | Text tab bar with an underline indicator; sticky when you scroll |
| Filters (sports, weeks) | Small chips (as WeekChips today) |
| Two-way toggles (Today/This week) | Segmented control |

**Work:**
- [x] Web: `leagues/[id]/layout.tsx` tab nav → underline tab bar (sticky). Sport filters in `_sections/upcoming.tsx` and `_sections/sports.tsx` → chips; Today/This week → segmented.
- [x] Mobile: league sections → `WzTabBar` (`ui/tab_bar.dart`, underline, fixed above the section).
- [ ] Sport filters → chip style (web + mobile); `WzSegmented` kept for toggles.
- [ ] Remove the pill style from anything that isn't a filter.

## 2. Compact league header — done
**Was:** an 80px logo, type badge, balance and member line above every tab,
repeating the name and logo already in the top bar; content started about
halfway down the phone.

**Now (web + mobile):**
- Top bar: league logo, type icon (swords / trophy), name.
- League row on every tab: **balance** (money) or **my rank** "3rd of 18"
  (pick'em) on top, **Week 3 · Open** under it, a › — tapping it opens the
  **league details sheet**. **Invite** on the right; a draft league's
  commissioner gets **Activate** there instead.
- Details sheet (web vaul `Drawer`, mobile bottom sheet): logo, name, type +
  week, description, stats (Balance or Rank · Members · Record), Invite,
  commissioner. Rank and record come from the season standings (same query as
  Standings › Overall) — no backend change.
- Tabs: underline tab bar. Web: the row scrolls away and the tabs pin under the
  top bar (`main` uses `overflow-x-clip` so sticky works). Mobile: the row and
  tabs sit fixed above the section's list (each section still owns its own
  scroll view; a `NestedScrollView` would let the row scroll away too).

## 2b. My Leagues cards — done
Each league card is two rows, every line one line (no wrapping):
- Row 1: 44px logo; type icon + name over the member faces (3 + "+N", or
  "Just you"); on the right my **balance** (money), **rank** "3rd of 11"
  (pick'em — `my_rank` on the league list, same number as /standings), or
  "not started" (draft).
- Row 2: the week badge (or Draft), then "N new posts", then ›.
- **Join with code** (sheet: paste a code or link → `/c/<code>`) and **Create
  league** under the list; **+** in the top bar also creates a league.
- Next: a per-league status line ("2 bets pending", "9 of 16 picks") needs
  per-league counts from the backend.

## 2c. League feed + comments — done
- **Timeline** (Threads-style): people's posts / announcements are rows —
  avatar, name · time, text, an icon action row (react, 💬 count) and the
  **newest comment inline** ("View all N comments"). Joins, bets and weekly
  results are **one-line activity rows** (icon, text, game line, counts).
- **Comments sheet** (Instagram-style, web vaul `Drawer` / app bottom sheet):
  post summary + reactions, threads with replies behind "View N replies",
  "Replying to" chip, quick-emoji row, pill composer. Post composer is a sheet.
- `latest_comment` comes with the batched engagement call (comments service).
- Open: hearts on comments; a full post page for notification deep links;
  whether members (not just commissioner/moderators) can post.

## 3. Bottom sheets instead of centred dialogs
**Today:** web bet details, confirmations, counter offers, member picks and
league details open as centred dialogs. On phones, sheets that slide up from
the bottom (drag handle, swipe down to close) feel native. The app already uses
sheets for the bet and counter flows, but still uses dialogs for bet details
and confirmations.

**Change:** one sheet component for anything that isn't a short yes/no confirm.
Keep short confirms as compact dialogs.

**Work:**
- [ ] Web: a `ResponsiveSheet` on the existing `drawer` (vaul) for BetDetailsDialog, CounterButton, MemberPicksDialog, league details, invite dialog, bet dialogs.
- [ ] Mobile: `showWzDialog` callers → `showModalBottomSheet` with a drag handle (bet details, co-winner chooser, league details); `confirmWz` stays a dialog.

## 4. Design tokens
**Today:** about 10 text sizes (10, 10.5, 11, 12, 13, 14…), ad-hoc spacing, and
mixed icon sizes, chosen per screen.

**Change:** one small scale, shared by web (CSS variables / Tailwind theme) and
app (`app_theme.dart`):
| Token | Values |
|---|---|
| Type | page title 20/700 · section 16/600 · body 14/400 · caption 12/400 · micro 11/600 (badges only) |
| Spacing | 4 · 8 · 12 · 16 · 24 · 32 |
| Radius | sm 6 · md 8 · lg 12 · pill |
| Icons | 16 · 20 · 24 |

**Work:**
- [ ] Web: add the scale to `styles/globals.css` `@theme`; replace one-off `text-[10px]`/`text-[10.5px]`/`text-[13px]` etc.
- [ ] Mobile: `WzText` styles (`title`, `section`, `body`, `caption`, `micro`) + spacing constants in `theme/app_theme.dart`; replace inline `TextStyle(fontSize: …)`.
- [ ] A lint/grep check in CI for arbitrary text sizes (web) once the sweep is done.

## 5. Touch targets
**Today:** week chips are 32px tall; some icon buttons are 36px. Guidelines:
44pt (iOS) / 48dp (Android).

**Change:** every tappable thing has a ≥ 44px hit area. Keep the visual size;
grow the hit area with padding.

**Work:**
- [ ] Web: `week-chips.tsx`, icon buttons in cards, reaction bar, member menu.
- [ ] Mobile: `WeekChips`, `IconAction`, dense `WzButton` in bet cards (keep 36px visual, 44px hit via `MaterialTapTargetSize`/padding).

## 6. Game and bet rows
**Today:**
- Games without lines show two columns of grey "—" boxes.
- Scores and money don't use fixed-width digits everywhere, so numbers shift.
- "Week 10 (open)" shows the raw status.

**Done (game list):** the Spread/Total/Winner board of boxes read as separate
picks, but tapping anywhere opened the bet sheet with nothing chosen. Upcoming
and Sports now show one **matchup card** per game: time, each team with its
spread as muted text, "O/U 47.5" (or "Lines not posted") and a "Bet ›" label;
the whole card opens the unchanged bet sheet (web `ScheduleBoard` in
`event-card.tsx`, mobile `ScheduleBoard` in `league/upcoming_tab.dart`).

**Change:**
- `tabular-nums` / `FontFeature.tabularFigures()` on every score, record, stake and balance.
- Period status as a small badge: `Week 10 · Open`.

**Work:**
- [ ] Web: `components/event-card.tsx` (ScheduleBoard rows), `wager-card.tsx`, league header period line.
- [ ] Mobile: `ScheduleBoard` in `league/upcoming_tab.dart`, `widgets/wager_card.dart`, league header.

## 7. Surfaces and contrast
**Today:** bordered cards inside bordered sections inside bordered cards. Muted
text on dark cards (e.g. "12 members · Week 10 (open)") may be near the minimum
contrast.

**Change:**
- One border level: cards get a border; content inside cards uses background tints (muted/40) instead of more borders.
- Check muted-foreground on card and background in both themes against WCAG AA (4.5:1 for body text); adjust the token if short.

**Work:**
- [ ] Audit + fix nested borders (reckoning card, game rows, invite sheet, manage cards).
- [ ] Contrast check of `--muted-foreground` / `WaygerzColors.mutedForeground` on `card` in light + dark.

## 8. Feedback and motion (app first)
**Change:**
- Haptics: light tap on pick/select, success on pick saved / bet placed / bet won.
- Instant updates for picks and reactions (roll back on error) instead of waiting for the server.
- Shimmer skeletons instead of the pulse; short fade/slide between tabs.

**Work:**
- [ ] Mobile: `HapticFeedback` in picks, bet sheet, reactions; optimistic state in `PicksTab` and `ReactionControl`; `Skeleton` shimmer.
- [ ] Web: optimistic picks/reactions via TanStack Query `onMutate`; skeleton shimmer in `components/ui/skeleton.tsx`.

## 9. Accessibility
**Change:**
- The app respects the phone's larger text setting without clipping (test at 1.3× and 2×).
- Every icon-only button has a label (tooltip/`aria-label`/`Semantics`).
- Focus order and visible focus on web.

**Work:**
- [ ] Mobile: remove fixed heights that clip text (e.g. 44px rows with text) or make them min-heights; audit `IconButton`s for tooltips.
- [ ] Web: audit icon buttons for `aria-label`; check focus rings in dark mode.

---

## Out of scope
- Backend changes (none needed).
- The Metronic template cleanup (tracked separately in `ISSUES.md`); do it before #4 so the token sweep has less dead code to touch.

## Rollout
Each numbered item ships on its own: commit → CI → deploy **webui** when
approved; mobile goes with the next APK/TestFlight build.

## Open decisions
1. ~~League tabs~~ — underline tab bar (done).
2. ~~Collapsing header~~ — one league row on every tab (done).
3. Web sheets: all non-confirm dialogs (recommended) or only the bet flows.
