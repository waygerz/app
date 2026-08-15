# Feature plan: Bet recommendations (rivalry challenges)

Favorite-team-driven bet recommendations. When two members of an H2H money
league have favorite teams facing off in an upcoming game, surface a rivalry
bet they can propose to each other — as a **live per-viewer "pull" section** and
a **notification push to both**. Favorites (Track B) unshelved this; it's the
payoff.

> Supersedes the shelved "Bet recommendations" section in
> `FEATURE_PLAN_favorite_teams.md`. Design refined: **no personal-feed storage** —
> recs are computed live per viewer, plus a targeted notification. Not the league
> (broadcast) feed — consistent with the bets-stay-between-two-players ethos
> ([[bets-in-chat-dm-only]]).

## Scope & constraints (locked by how betting works)
- **H2H money leagues only.** Pick'em is you-vs-field, not member-vs-member.
- **The two must be co-members of the same H2H league** — a wager needs a league
  context (`contests._validate_context` requires `league_id` + co-membership).
  So a rec is always *within* a shared H2H league. (Friend-vs-friend without a
  shared league is out — it'd need a "bet without a league" path we don't have.)
- Play-money / even-money per the launch gating. **Never auto-places** — a rec
  only pre-fills a proposal the user confirms.

## The two surfaces
Both read the SAME computed recommendations; neither stores a personal feed.

### 1. Pull — "Rivalries" section on the league page (✅ league-scoped)
A section on **each H2H league page** that calls a **league-scoped**
recommendations endpoint (`GET /<league_id>/recommendations`) for the signed-in
viewer and renders rivalry cards for THAT league. League-scoped because the bet
is against *that league's* members — contextual, and simpler than an aggregate.
It only populates when the viewer has favorites AND a matchup against a league-
mate, so it's **inherently favorites-gated** (no favorites → hidden). Non-H2H
(pick'em) league pages don't show it.

### 2. Push — notification to both users
When a *fresh* rivalry pairing appears (a game entering the lookahead window), a
one-time **in-app notification** (never SMS) is sent to **both** members:
"You back the Cardinals — Marcus backs the Bills, Sunday. Challenge him?" New
opt-outable category (`bet_rec`), `channels: ["inapp"]`, deduped per
(recipient, event, opponent).

## The rec, and the action flow
A recommendation = `{league, event, you (side+team), opponent (side+team),
suggested_stake}`. The card's **Challenge** →

1. Tapping Challenge proposes the wager via **contests** (the existing propose
   flow): proposer = the viewer (JWT identity), acceptor = the opponent, side =
   the viewer's favorite's side, event/league from the rec, stake = league
   min/default (editable).
2. The opponent then gets the **standard "New bet challenge"** (Accept/Reject)
   they already know.

So the rec only *seeds* the existing bet flow — no new betting mechanics. Once a
wager exists between the pair on that event, the rec drops out.

## Matching logic
Per active H2H league, per upcoming event in the league's sports (its
`league_sports.sport_league_id`s), within the lookahead window:
1. Map each member's favorite to a **side** by the same join the ingestor uses —
   `(league, abbreviation.upper())` then `(league, name)` — since events carry
   team *strings*, not ids. The favorite snapshot's `abbreviation` + `league`
   make this work with no team-id FK.
2. A member on **home** + a member on **away** = a rivalry pair.
3. Skip: same team, either inactive, or a wager already exists between them on
   that event (dedup — v1, via the contests lookup below).
4. Rank: soonest game first; **primary** favorite (position 0) outranks a
   secondary one; cap per viewer to avoid flooding.
5. **Auto-pick the opponent:** when several league-mates back the opposing side,
   the card names ONE — the highest-ranked (primary-team fan, then fewest
   existing bets) — and Challenge proposes to them. One tap, no chooser.

## Owner: `leagues` (recommended)
`leagues` already owns members, `league_sports`, the viewer→leagues mapping
(`/internal/user-league-ids`), the ingestor link (it builds periods from ingestor
weeks), and a tick. It's the natural place to compute recs. Internal calls it
adds:
- **`users` — `POST /internal/favorites`** (NEW): batch `user_ids → [favorites]`.
  (A dedicated batch endpoint, not bloating `/internal/profiles`.)
- **`contests` — existing-wager lookup** (NEW, for dedup #3, **v1**): given
  `(league_id, [event_ids])`, return the `(event_id, user_a, user_b)` pairs that
  already have a wager, so leagues filters them out.
- **`notifications` — `/internal/notify`** for the push (leagues needs
  `NOTIFICATIONS_URL`; add if absent).

*Alternative — `contests` owns it:* it has the propose flow + wager dedup
locally, but would need to pull members/sports/leagues from `leagues` and add an
upcoming-events helper — more new endpoints. Leagues-as-owner adds fewer pieces.

## New pieces (checklist)
1. **`users`** — `POST /internal/favorites` (batch).
2. **`leagues`** — rec compute (match favorites↔upcoming events, auto-pick the
   opponent, suggested stake = league min); a **league-scoped pull endpoint**
   `GET /<league_id>/recommendations` (the viewer's rivalry recs for that H2H
   league); a **throttled push pass** (notify both on a fresh pairing — hourly-ish,
   NOT every 30s tick); `NOTIFICATIONS_URL` + rely on the notification `dedup_key`.
3. **`contests`** — existing-wager lookup for dedup (**v1**).
4. **web** — the "Bets for you" pull section (home/league) + rivalry card +
   Challenge action (pre-fills contests propose) + the `bet_rec` notification
   card in the notifications feed.

## Cadence / windows
- **Lookahead = an explicit rolling window (~3 days)** — NOT the league period.
  (Audit: season H2H leagues, the money default, have one *unbounded* season-long
  period, so "events in the open period" = every scheduled game all season — no
  usable near-term boundary. See Considerations §1.) The window is a `starts_after`
  /`starts_before` filter on the ingestor `GET /events` from the leagues side.
- **Push cadence — use a dedup latch, not a global timer** (audit-refined): the
  leagues tick recomputes pairs, but each `(pair, event)` push fires **once** via
  a latch (a `bet_rec` sent-marker per pair+event, mirroring the nudge's
  `favorites_nudged_at`) + the notification `dedup_key`. So no "~hourly" global
  gate is needed — the latch makes it once-only regardless of the 30s tick.
  (Optionally still gate the whole pass to every few minutes to bound fanout.)
- **Pull:** computed live on request (cache briefly, e.g. 60s, to bound repeated
  ingestor/users fanout).

## Decisions (locked 2026-08-14)
1. ✅ **Pull section = on each H2H league page**, league-scoped (bets are against
   that league's members). Endpoint `GET /<league_id>/recommendations`.
2. ✅ **Auto-pick the opponent** (highest-ranked opposing fan) — one-tap
   Challenge, no chooser.
3. ✅ **Dedup vs existing wagers in v1** — via the new contests existing-wager
   lookup; a pair who already bet on that game isn't re-recommended.
4. ✅ **Stake default = $0 "bragging rights" — a beer on the line 🍺.** Resolves
   the 2nd-audit dead-button risk: $0 bypasses balance + min/max
   (`_wallet_op` no-ops at `amount <= 0`; `_validate_context` skips the stake
   bounds), so it's always affordable for BOTH sides and needs **no wallet check**.
   Uses the app's existing bragging-rights wager (the 🍺 Beer / "Bragging rights"
   treatment already in the bet cards). The challenger can still raise the stake
   before proposing. (The `who_can_propose` = commissioner-only guard in
   Considerations §4 still applies — it's independent of stake.)

Still open (minor): the `bet_rec` **notification** should be an in-app-only,
**opt-outable** category — confirm it's a user-controllable notification type
when we wire it (it's frequent, so users should be able to mute it).

## Considerations & edge cases (added 2026-08-14)
**v1 requirements (correctness):**
1. **Rec window — an explicit rolling window, NOT the period** (audit-corrected).
   Season H2H leagues have one unbounded season-long period and `period_status`
   is forced `open` while the league is active, so the period gives no near-term
   bettable slate. Use a rolling **~3-day** ingestor `GET /events` window
   (`starts_after`/`starts_before`, from leagues — `league_context` does NOT
   expose the period window). Still gate "bettable now" on: league `active`,
   `period_status == open` (auto-true for active season leagues), event
   `scheduled` + not started.
2. **Graceful propose failures.** A valid-looking rec can still fail when tapped —
   period closed, game started, or (money leagues) short balance. Challenge must
   degrade gracefully (surface the reason, drop the rec), like the expired-bet
   fix — never a dead button. **NOTE (audit):** the batch propose endpoint returns
   **2xx with an `errors[]` array** (not 4xx), so the web must read
   `errors[].error`, not the HTTP status, to detect a failed Challenge.
3. **Stale recs.** Hide/disable a rec whose game has kicked off (check event
   `start_time`; contests rejects it anyway). Edge: a null start-time isn't
   treated as started — such recs won't auto-hide.
4. **Dead-button guards (audit).** Two things could make Challenge fail:
   (a) **Balance** — accept *also* holds funds, so a real-stake rec could dead-end
   on the opponent's side (402). **Resolved** by the $0-beer default (Decisions
   §4): $0 bypasses balance + min/max, so no wallet check is needed. (If the
   challenger raises the stake, contests validates it at propose time — their
   risk, handled by the graceful-failure path §2.)
   (b) **`who_can_propose`** — some leagues restrict proposing to the
   **commissioner**; only surface Challenge to a user who can actually propose in
   that league (else a dead button). This is independent of stake.

**Product decision (locked, flippable):**
5. ✅ **Push = primary-team rivalries only.** The pull section shows **all**
   rivalries; the notification **push** fires only when the matchup involves a
   user's **primary** team (position 0) — rare + high-signal, avoids a heavy
   sports week spamming both users. (Flip to "all favorites" later if too quiet.)

**Handle in v1:**
6. **Reciprocity dedup.** Both users get pushed about the same matchup; once a
   live wager exists between the pair on that event, suppress the *other* user's
   rec so they don't get rec + real challenge for the same game. Match the pair
   **unordered** (proposer/acceptor either way — a `filter_by(proposer=A,
   acceptor=B)` would miss the reciprocal) and only against **live statuses**
   (OPEN/ACCEPTED) so a declined/cancelled prior wager doesn't suppress a fresh
   rec.

**v1.1 / minor:**
7. **Target opt-out** — a user may not want to be *named* as someone's suggested
   opponent (the notification mute only covers receiving). Over-engineering for
   v1; flagged.
8. **Latch cleanup** — prune the per-(pair, event) dedup-latch rows for past
   games so the table doesn't grow forever.
9. **Fanout cost** — computing recs across all H2H leagues on the tick = N leagues
   × (favorites + events) fetches; lean on caching + the latch; note for scale.

## Audit (verified against code, 2026-08-14)
Plan is **buildable, leagues-as-owner confirmed.** Pleasant surprise: leagues
**already talks to notifications** (`_notify_league` + `NOTIFICATIONS_URL`,
proven on league invites) — the push needs only a new category, not a new client.
Also already there: `LeagueMember`+active status, `LeagueSport.sport_league_id`
(exposed via `league-context`), leagues→ingestor client + `/internal/tick`,
ingestor `GET /events` with `sport_league_id`+`status`+`starts_after/before`+start
ordering, the `(league, abbr.upper())`→`(league, name)` join keys, `Wager`
columns for dedup, and the full propose flow (JWT caller = proposer,
`min_wager_cents` in context, H2H gate). notifications has a per-category
in-app mute mechanism.

**8 net-new pieces (most already anticipated):**
1. `leagues` — internal **list-a-league's-active-members** endpoint (only the
   inverse `user-league-ids` exists).
2. `users` — `POST /internal/favorites` batch (only `/internal/profiles` exists).
3. `contests` — internal **dedup** endpoint `(league_id,[event_ids]) → existing
   (event_id, proposer_id, acceptor_id)` (treat the pair **unordered**).
4. `leagues` — rec-match + push in the tick + the **dedup latch** (no in-tick
   throttle pattern in leagues today).
5. `leagues` — generalize `_notify_league` for a `bet_rec` category + challenge
   `deep_link` (it hardcodes `league_invite`/`ref_type=league`).
6. `leagues` + web — the league-scoped **pull endpoint** + the "Rivalries"
   section (computed live, no rec store).
7. `notifications` — register `bet_rec` in `CHANNEL_DEFAULTS` +
   `APP_NOTIFICATION_CATEGORIES` + the account toggle (mute mechanism exists, the
   category doesn't) so it's a first-class user control.
8. web notifications feed — a new `ActionKind`/`notifMeta` case + `act` branch
   that **proposes** (creates) a wager via contests, plus a "Challenge" button
   variant (today's `bet` action only accepts/declines an existing code).

**Nuances:** dedup pair is unordered; the favorite→side join replicates the
ingestor's key-building against the event's denormalized strings (doesn't call
`attach_logos`); "stake = league min" is a UI pre-fill, not an enforced floor
($0 bragging-rights bets bypass the minimum).

## Constraints
- Mobile-first (≥44px, ≥16px, no h-scroll). Depends on favorites (Track B) being
  live. Commit each edit; deploy only when told.
