# Pick'em Weekly Contest — End-to-End Test Plan

How the weekly Pick'em contest is verified end-to-end, and how to run the suite
locally (outside docker-compose).

## The lifecycle under test

```
create (pickem, weekly)
   └─ activate ──────────────► _prebuild_periods seeds a LeaguePeriod per
                               ingestor "week"; earliest flips OPEN (Week 1),
                               rest UPCOMING (Week 2…)
members join (join_code)
each member submits picks ───► PUT /periods/<pid>/picks  (side per event_id,
                               + tiebreaker_total on the last game)
                               lock rule server-side = period.status must be OPEN
games finish (ingestor) ─────► event.status "final", winner_side, scores
scheduler POST /internal/tick
   ├─ grade_open_periods ────► Pick.correct = (pick_side == winner_side)
   └─ rollover_periods ──────► period whose ends_at ≤ now → FINAL; next week OPEN
GET /periods/<pid>/results ──► weekly leaderboard: correct count, tiebreaker_diff
                               (|predicted total − actual last-game total|), rank
                               (ties on (correct, tiebreaker_diff) share a rank)
PUT …/members/<uid>/confirm ─► commissioner/moderator marks a row confirmed
GET /standings ─────────────► season-cumulative wins/losses from graded picks
```

**Key seams (must be stubbed in a test — no docker):**

| Seam (`service_leagues`) | Why | Stub |
|---|---|---|
| `ingestor_weeks(sport_league_id)` | seeds periods on activate | return `[{label,start,end,count}]` with `end` in the future |
| `get_event(external_id)` | game state/results for grading + results | mutable dict per event: `{status, winner_side, home_score, away_score, start_time, …}` |
| `resolve_users_full(ids)` | member display names in `_detail`/`standings`/`results` | stubbed in `conftest.py::mock_clients` |
| `warm_event_cache` / `ingestor_warm_cache` | ingestor cache warm on create/activate | no-op in `conftest.py::mock_clients` |
| **time** | lock/rollover use real `datetime.utcnow()` (not injectable) | close a week by writing `period.ends_at` into the past before a tick |

Note: the "picks lock 1h before first game" rule is **webui-only**. Server-side,
picks are locked purely by `period.status != OPEN`.

## Running the tests locally (no docker)

The `leagues` service needs **Postgres only** (no Redis). Tests run against a
`*_test` schema (conftest asserts the name ends in `_test` and drops it after).

```bash
# 1. Postgres (once) — a throwaway cluster on a non-default port, short socket dir
sudo dnf install -y postgresql15-server postgresql15
initdb -D "$PWD/.pgdata" -U waygerz --auth=trust
mkdir -p /tmp/wpg
pg_ctl -D "$PWD/.pgdata" -o "-p 5433 -k /tmp/wpg -c listen_addresses=127.0.0.1" \
       -l "$PWD/.pgdata/pg.log" start
createdb -h 127.0.0.1 -p 5433 -U waygerz waygerz

# 2. venv + deps
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# 3. run
export DATABASE_URL="postgresql+psycopg2://waygerz:waygerz@127.0.0.1:5433/waygerz"
export DB_SCHEMA=leagues_test JWT_SECRET_KEY=test-secret-key-32-bytes-minimum-len INTERNAL_TOKEN=dev-internal-token
.venv/bin/python -m pytest -q                    # whole suite
.venv/bin/python -m pytest tests/test_pickem_e2e.py -q   # just the e2e
```

(The canonical CI/docker invocation still works:
`docker compose exec -e DB_SCHEMA=leagues_test leagues python -m pytest -q`.)

Socket-path gotcha: PG's Unix socket dir must be ≤107 bytes, so point `-k` at a
short path (`/tmp/wpg`), not a long scratch dir. TCP on `127.0.0.1:5433` is what
`DATABASE_URL` uses.

## What `tests/test_pickem_e2e.py` covers

`test_weekly_pickem_end_to_end` drives one full week through the real HTTP
surface and asserts at each stage:

1. Create weekly pickem league → activate seeds **Week 1 (open) + Week 2 (upcoming)**.
2. A second member joins by code.
3. Both submit 3 picks incl. a tiebreaker on the last game.
4. A tick **before kickoff grades nothing** (`picks_graded == 0`).
5. Games go final + week's `ends_at` pushed to the past → one tick
   **grades all 6 picks and rolls the week over** (`picks_graded == 6`,
   `periods_rolled == 1`).
6. Weekly leaderboard: both tie at 2/3 correct → **tiebreaker** ranks the exact
   predictor #1 (diff 0 vs 6), ranks 1 and 2.
7. Week 1 → **final**, Week 2 → **open**.
8. Week 1 is **locked** (400 "locked"); Week 2 **accepts** picks.
9. Commissioner **confirms** a member's Week 1 row.
10. **Season standings** show cumulative wins/losses from graded picks.

## Results (2026-07-16)

- `tests/test_pickem_e2e.py` — **passing**
- `tests/test_pickem.py` — **11/11 passing**
- Full `leagues` suite — **38/39 passing**

### Harness change

`conftest.py::mock_clients` previously stubbed only 3 cross-service calls; it now
also stubs `resolve_users_full`, `warm_event_cache`, and `ingestor_warm_cache`,
so the suite is **hermetic** (runs locally/CI without live auth/ingestor).
Test-only change — no runtime or deploy impact.

### Known pre-existing failure (not Pick'em)

`test_leagues.py::test_unread_feed_count_on_dashboard` fails on **fast machines**.
`_unread_feed_count` uses a strict `LeagueFeed.created_at > joined_at`, and both
columns default to `datetime.utcnow` evaluated in the **same flush** — on a quick
in-process run they land on the **identical microsecond**, so the "league_created"
item isn't counted (0 instead of ≥1). Passes on slower CI/docker. Unrelated to
Pick'em. Fix options: use `>=`, or stamp the creation feed a hair after the
commissioner's `joined_at`.
