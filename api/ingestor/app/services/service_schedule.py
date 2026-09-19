"""ESPN team-sport schedule ingester — the master forward schedule.

RTS is a live scoreboard (one game at a time), so team-sport *events + scores*
come from ESPN's free public API instead, upserted into the durable `Event`
table (the single master, discriminated by `sport`/`league` — no per-league
tables). RTS / The Odds API remain the odds source, matched on later (Phase 4).

One config-driven pipeline, not per-league handlers: ESPN's scoreboard payload
is identical across team sports, so parsing + upsert are shared. Leagues differ
only in how the fetch window is expressed:
  * native_week (NFL, college FB) — read the scoreboard `calendar`, iterate its
    week entries, fetch `?dates={year}&seasontype={t}&week={n}` per week.
  * date_range (NBA, MLB, NHL, soccer) — fetch `?dates={YYYYMMDD}` per day
    over a forward window.

Adding a league is one LEAGUE_REGISTRY line. Slugs match the catalog because RTS
(which the catalog is built from) is itself an ESPN proxy, so ESPN's
`(sport, league)` and `catalog_id(sport, league)` line up automatically.
"""
import json
import threading
import time
from datetime import datetime, timedelta

from flask import current_app
from sqlalchemy import and_, or_

from app.extensions import db, get_redis
from app.models.event import CANCELLED, FINAL, LIVE, SCHEDULED, Event
from app.models.sport_league import SportLeague
from app.services import service_availability as availability
from app.services import service_sports as sports
from app.services.service_espn import espn_get, espn_get_many
from app.services.service_events import _parse_dt
from app.services.service_logos import cache_logo

# ---------------------------------------------------------------- registry
# strategy: "native_week" (ESPN calendar weeks) | "date_range" (forward window).
LEAGUE_REGISTRY = [
    {"sport": "football", "league": "nfl", "strategy": "native_week"},
    {"sport": "football", "league": "college-football", "strategy": "native_week"},
    {"sport": "basketball", "league": "nba", "strategy": "date_range"},
    {"sport": "baseball", "league": "mlb", "strategy": "date_range"},
    {"sport": "hockey", "league": "nhl", "strategy": "date_range"},
    {"sport": "soccer", "league": "eng.1", "strategy": "date_range"},
    {"sport": "soccer", "league": "usa.1", "strategy": "date_range"},
]

# (sport, league) pairs the ESPN ingester owns — RTS event sync is disabled for
# these so events don't duplicate (service_events.sync_league checks this).
REGISTRY_KEYS = {(e["sport"], e["league"]) for e in LEAGUE_REGISTRY}


def _registry_entry(sport, league):
    for e in LEAGUE_REGISTRY:
        if e["sport"] == sport and e["league"] == league:
            return e
    return None


# ---------------------------------------------------------------- parsing
def _to_int(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _clip(value, n):
    """Fit a value to its column width. ESPN sometimes stuffs a full name into a
    short field (e.g. an All-Star game's abbreviation = 'Liga MX All-Stars'),
    which would overflow varchar(12) and roll back the whole batch."""
    if isinstance(value, str) and len(value) > n:
        return value[:n]
    return value


def _espn_status(status):
    """ESPN status.type -> our Event status. Mirrors service_espn.map_status but
    maps to the Event constants (LIVE, not IN_PROGRESS)."""
    st = status or {}
    if st.get("completed") is True:
        return FINAL
    state = (st.get("state") or "").lower()
    if state == "post":
        return FINAL
    if state == "in":
        return LIVE
    typ = st.get("type") or {}
    text = (typ.get("name") or typ.get("detail") or typ.get("shortDetail") or "").upper()
    if any(w in text for w in ("FINAL", "COMPLETE")):
        return FINAL
    if any(w in text for w in ("CANCEL", "POSTPON", "ABANDON")):
        return CANCELLED
    if any(w in text for w in ("PROGRESS", "LIVE", "SUSPEND", "DELAY")):
        return LIVE
    return SCHEDULED


def _price(value):
    """ESPN American odds string ('-135', '+114', 'EVEN') -> int, else None."""
    if value is None:
        return None
    s = str(value).strip().upper()
    if s == "EVEN":
        return 100
    try:
        return int(float(s))
    except ValueError:
        return None


def _point(value):
    """ESPN line string ('-2.5', '+2.5', 'o46.5', 'u46.5') -> float, else None."""
    if value is None:
        return None
    s = str(value).strip().lower().lstrip("ou")
    try:
        return float(s)
    except ValueError:
        return None


def _espn_odds(comp):
    """The competition's first bookmaker line (DraftKings on ESPN) -> the same
    normalized odds block The Odds API produces (service_odds._book_odds):
    moneyline / spread (line = home number) / overUnder, American prices. ESPN
    labels the current line `close` (vs `open`). None when no line is posted."""
    books = comp.get("odds") or []
    if not books:
        return None
    o = books[0]

    def cur(market, side, field):
        leg = ((o.get(market) or {}).get(side) or {})
        return (leg.get("close") or leg.get("open") or {}).get(field)

    out = {
        "source": "espn",
        "book": ((o.get("provider") or {}).get("name") or "").lower() or None,
        "fetched_at": datetime.utcnow().isoformat() + "Z",
    }
    ml = {k: _price(cur("moneyline", k, "odds")) for k in ("home", "away")}
    if any(v is not None for v in ml.values()):
        out["moneyline"] = ml
    line = _point(cur("pointSpread", "home", "line"))
    if line is None:
        line = _point(o.get("spread"))
    if line is not None:
        out["spread"] = {
            "line": line,
            "home": _price(cur("pointSpread", "home", "odds")),
            "away": _price(cur("pointSpread", "away", "odds")),
        }
    total = _point(cur("total", "over", "line"))
    if total is None:
        total = _point(o.get("overUnder"))
    if total is not None:
        out["overUnder"] = {
            "total": total,
            "over": _price(cur("total", "over", "odds")),
            "under": _price(cur("total", "under", "odds")),
        }
    return out if any(k in out for k in ("moneyline", "spread", "overUnder")) else None


def _parse_espn_event(ev, sport, league, week_label=None):
    """ESPN scoreboard event (competitions/competitors shape) -> Event fields."""
    comp = (ev.get("competitions") or [{}])[0]
    competitors = comp.get("competitors") or []
    home = next((c for c in competitors if c.get("homeAway") == "home"), {})
    away = next((c for c in competitors if c.get("homeAway") == "away"), {})
    ht = home.get("team") or {}
    at = away.get("team") or {}

    status = _espn_status(comp.get("status") or ev.get("status"))
    winner_side = None
    if status == FINAL:
        if home.get("winner"):
            winner_side = "home"
        elif away.get("winner"):
            winner_side = "away"
        else:
            winner_side = "draw"

    season = ev.get("season") or {}
    wk = ev.get("week") or {}
    fields = {
        "external_id": _clip(str(ev.get("id")) if ev.get("id") is not None else None, 64),
        "sport": sport,
        "league": league,
        "name": _clip(ev.get("name"), 200),
        "short_name": _clip(ev.get("shortName"), 80),
        "home_team": _clip(ht.get("displayName") or ht.get("name"), 120),
        "home_abbr": _clip(ht.get("abbreviation"), 12),
        "away_team": _clip(at.get("displayName") or at.get("name"), 120),
        "away_abbr": _clip(at.get("abbreviation"), 12),
        "start_time": _parse_dt(ev.get("date")),
        "status": status,
        "home_score": _to_int(home.get("score")),
        "away_score": _to_int(away.get("score")),
        "winner_side": winner_side,
        "season_year": season.get("year"),
        "week_number": wk.get("number"),
    }
    # Only set week_label when known so a later score-refresh (no calendar
    # context) doesn't wipe the label written by the fixture ingest.
    if week_label is not None:
        fields["week_label"] = _clip(week_label, 80)
    # Same for odds: ESPN drops the line from some boards (e.g. after the game),
    # and that must not erase the last one we stored.
    odds = _espn_odds(comp)
    if odds is not None:
        fields["odds"] = odds
        fields["odds_updated_at"] = datetime.utcnow()
    return fields


def _cache_event_teams(ev, sport, league):
    """Upsert Team rows (with cached logos) from the event's competitors, so
    attach_logos resolves logos without an RTS team sync."""
    comp = (ev.get("competitions") or [{}])[0]
    for c in comp.get("competitors") or []:
        t = c.get("team") or {}
        ext = str(t.get("id")) if t.get("id") is not None else None
        name = t.get("displayName") or t.get("name")
        if not ext or not name:
            continue
        sports.upsert_team({
            "external_id": _clip(ext, 64),
            "sport": sport,
            "league": league,
            "name": _clip(name, 120),
            "abbreviation": _clip(t.get("abbreviation"), 12),
            "slug": _clip(t.get("slug"), 120),
            "location": _clip(t.get("location"), 80),
            "color": _clip(t.get("color"), 8),
            "alternate_color": _clip(t.get("alternateColor"), 8),
            "logo": cache_logo(t.get("logo") or ""),
        })


def _odds_line(odds):
    """An odds block minus its fetch timestamp — what counts as a changed line."""
    return {k: v for k, v in (odds or {}).items() if k != "fetched_at"} or None


def _apply_changes(row, fields):
    """Set only the fields that differ, so an unchanged game costs no UPDATE.
    Returns True when anything changed."""
    changed = False
    for key, value in fields.items():
        if key == "odds_updated_at":
            continue  # moves with odds below
        if key == "odds":
            if _odds_line(value) != _odds_line(row.odds):
                row.odds = value
                row.odds_updated_at = fields.get("odds_updated_at")
                changed = True
            continue
        if getattr(row, key) != value:
            setattr(row, key, value)
            changed = True
    return changed


def _ingest_events(raw_events, sport, league, week_label=None, teams=False):
    """Upsert one ESPN board. The live score refresh runs this for every league
    each tick, so it's built to be cheap: one query loads the board's existing
    rows, only rows that actually changed are written, last_synced_at is bumped
    for the whole board in one statement, and team rows (+ logo checks) are only
    upserted for new games or when ``teams`` (the daily fixture pass)."""
    parsed = []
    for ev in raw_events or []:
        fields = _parse_espn_event(ev, sport, league, week_label)
        if fields["external_id"] and fields["home_team"] and fields["away_team"]:
            parsed.append((ev, fields))
    if not parsed:
        return 0
    ids = [f["external_id"] for _, f in parsed]
    existing = {e.external_id: e for e in Event.query.filter(Event.external_id.in_(ids)).all()}
    if teams or any(i not in existing for i in ids):
        # Serialize the team upserts below with the background fixtures thread's
        # sync_teams (both write teams.last_synced_at → deadlock otherwise).
        sports.acquire_team_write_lock()
    catalog = sports.catalog_id(sport, league)
    now = datetime.utcnow()
    for ev, fields in parsed:
        row = existing.get(fields["external_id"])
        if row is None:
            row = Event(external_id=fields["external_id"])
            db.session.add(row)
            for key, value in fields.items():
                setattr(row, key, value)
            row.sport_league_id = catalog
            row.last_synced_at = now
            existing[row.external_id] = row
            _cache_event_teams(ev, sport, league)
            continue
        _apply_changes(row, fields)
        if row.sport_league_id != catalog:
            row.sport_league_id = catalog
        if teams:
            _cache_event_teams(ev, sport, league)
    db.session.flush()
    Event.query.filter(Event.external_id.in_(ids)).update(
        {Event.last_synced_at: now}, synchronize_session=False
    )
    return len(parsed)


# ---------------------------------------------------------------- fetch
def _scoreboard(sport, league, params=None):
    path = "/scoreboard"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        if qs:
            path += "?" + qs
    return espn_get(sport, league, path)


def _scoreboards(sport, league, days):
    """Boards for several dates of one league, fetched concurrently. Returns
    [(day, board | Exception)] in date order."""
    days = sorted(days)
    paths = [f"/scoreboard?dates={d.strftime('%Y%m%d')}" for d in days]
    return [(d, res) for d, (_, res) in zip(days, espn_get_many(sport, league, paths))]


def _ingest_native(sport, league):
    """Native-week sports: walk the scoreboard calendar's seasontypes -> weeks,
    fetching each week's board and tagging events with the week label. Each week
    commits on its own and rolls back on error, so one bad week neither loses the
    others nor poisons the session for the leagues that follow."""
    now = datetime.utcnow()
    sb = _scoreboard(sport, league)
    leagues0 = (sb.get("leagues") or [{}])[0]
    calendar = leagues0.get("calendar") or []
    season = leagues0.get("season") or sb.get("season") or {}
    year = season.get("year")
    weeks = []
    for item in calendar:
        if not isinstance(item, dict):
            continue
        seasontype = item.get("value")
        for entry in item.get("entries") or []:
            week = entry.get("value")
            if year is None or seasontype is None or week is None:
                continue
            # A week that ended over two days ago can't change; refresh_scores
            # and the catch-up own any late result. Saves ~a season of requests
            # per daily pass.
            ended = _parse_dt(entry.get("endDate"))
            if ended is not None and ended < now - timedelta(days=2):
                continue
            weeks.append((week, entry.get("label"),
                          f"/scoreboard?dates={year}&seasontype={seasontype}&week={week}"))
    total = 0
    fetched = espn_get_many(sport, league, [path for _, _, path in weeks])
    for (week, label, _), (_, board) in zip(weeks, fetched):
        try:
            if isinstance(board, Exception):
                raise board
            total += _ingest_events(board.get("events"), sport, league,
                                    week_label=label, teams=True)
            db.session.commit()
        except Exception as exc:  # one bad week shouldn't sink the rest
            db.session.rollback()
            current_app.logger.warning(
                "schedule native %s/%s week %s: %s", sport, league, week, exc
            )
    return total


def _ingest_date_range(sport, league):
    """Date-based sports: walk a forward window one day per request (ESPN
    rejects the YYYYMMDD-YYYYMMDD range form with HTTP 400 since ~2026-09-15),
    each day committing independently and rolling back on error."""
    weeks_ahead = current_app.config["SCHEDULE_WEEKS_AHEAD"]
    start = datetime.utcnow().date()
    days = [start + timedelta(days=offset) for offset in range(weeks_ahead * 7)]
    total = 0
    for day, board in _scoreboards(sport, league, days):
        try:
            if isinstance(board, Exception):
                raise board
            total += _ingest_events(board.get("events"), sport, league, teams=True)
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            current_app.logger.warning(
                "schedule range %s/%s %s: %s", sport, league, day, exc
            )
    return total


# ---------------------------------------------------------------- refresh gating
def _k_fixtures(sport, league):
    return f"sched:fx:{sport}:{league}"


def _k_scores(sport, league):
    return f"sched:sc:{sport}:{league}"


def _stale(key, ttl):
    """True when the last successful run is older than ttl (or never ran).
    Timestamp-based (not a plain NX lock) so a failed run retries next tick
    rather than being locked out for the whole TTL."""
    last = get_redis().get(key)
    if last is None:
        return True
    try:
        return (time.time() - float(last)) >= ttl
    except (TypeError, ValueError):
        return True


def _mark(key):
    get_redis().set(key, time.time())


def refresh_fixtures(sport, league, force=False):
    """Full forward-schedule upsert for one league (gated ~weekly)."""
    if not force and not _stale(_k_fixtures(sport, league), current_app.config["SCHEDULE_FIXTURE_TTL"]):
        return 0
    entry = _registry_entry(sport, league)
    if entry is None:
        return 0
    if entry["strategy"] == "native_week":
        n = _ingest_native(sport, league)
    else:
        n = _ingest_date_range(sport, league)
    _mark(_k_fixtures(sport, league))
    return n


# How far around "now" a scheduled game still counts as live-ish: far enough
# back that a game in progress keeps the fast poll (ESPN can lag flipping a
# start), and a short lookahead so we're already polling at first pitch.
_LIVE_LOOKBACK = timedelta(hours=6)
_LIVE_LOOKAHEAD = timedelta(minutes=15)


def has_live_window(sport, league) -> bool:
    """True if this league has a game in progress or about to start.

    A local DB query — no API call. Anything already LIVE counts regardless of
    how long it's run (rain delays, extra innings); a SCHEDULED game counts if
    its start just passed (ESPN hasn't flipped it yet) or is imminent.
    """
    now = datetime.utcnow()
    return db.session.query(
        Event.query.filter(
            Event.sport == sport,
            Event.league == league,
            or_(
                Event.status == LIVE,
                and_(
                    Event.status == SCHEDULED,
                    Event.start_time >= now - _LIVE_LOOKBACK,
                    Event.start_time <= now + _LIVE_LOOKAHEAD,
                ),
            ),
        ).exists()
    ).scalar()


def refresh_scores(sport, league, force=False):
    """Re-fetch today's board to update live/final scores.

    Polled every SCHEDULE_SCORE_TTL_LIVE while the league has a game on, and
    only every SCHEDULE_SCORE_TTL_IDLE otherwise — so scores are near-live
    during games without hammering ESPN around the clock.
    """
    if not force:
        ttl = current_app.config[
            "SCHEDULE_SCORE_TTL_LIVE" if has_live_window(sport, league)
            else "SCHEDULE_SCORE_TTL_IDLE"
        ]
        if not _stale(_k_scores(sport, league), ttl):
            return 0
    try:
        # Yesterday AND today, not just today: ESPN buckets a game under its
        # LOCAL date, so a 7pm ET game is tomorrow in UTC. Querying only the
        # current UTC date meant last night's games fell off the board before
        # their final score landed — they aged out at their 0-0 placeholder and
        # the stale-event reaper then marked them final, so wagers on them could
        # never auto-settle. Plus the dates of any game still unresolved past its
        # kickoff, so a missed final is caught up from ESPN (free) rather than
        # left to the reaper.
        #
        # One request per date: ESPN rejects the YYYYMMDD-YYYYMMDD range form
        # (HTTP 400 since ~2026-09-15), which silently froze every score.
        now = datetime.utcnow()
        dates = {now.date(), (now - timedelta(days=1)).date()} | _stuck_dates(sport, league, now)
        n = 0
        failed = None
        for _, board in _scoreboards(sport, league, dates):
            if isinstance(board, Exception):
                failed = failed or board
                continue
            n += _ingest_events(board.get("events"), sport, league)
        db.session.commit()
        if failed:
            raise failed  # keep what landed; leave the gate unmarked to retry
    except Exception:
        db.session.rollback()  # keep the session clean for the next league
        raise
    _mark(_k_scores(sport, league))
    return n


def _k_upcoming(sport, league):
    return f"sched:up:{sport}:{league}"


# Upcoming games are re-read this far ahead so a pick'em week has lines from the
# day it opens, not just the last 48h before kickoff.
_UPCOMING_WINDOW = timedelta(days=7)


def refresh_upcoming(sport, league, force=False):
    """Re-read the ESPN boards that hold this league's scheduled games in the
    next week, so their lines (and any reschedules) stay current. ESPN is free
    and only the dates that actually have games are fetched; gated per league by
    ESPN_ODDS_TTL. A game's board date is its start in US Eastern, approximated
    as UTC-6h so a 00:15Z kickoff lands on the prior local day."""
    now = datetime.utcnow()
    cfg = current_app.config
    soon = (
        db.session.query(Event.id)
        .filter(
            Event.sport == sport,
            Event.league == league,
            Event.status == SCHEDULED,
            Event.start_time >= now,
            Event.start_time <= now + timedelta(hours=48),
        )
        .first()
    )
    ttl = cfg["ESPN_ODDS_TTL_SOON"] if soon else cfg["ESPN_ODDS_TTL"]
    if not force and not _stale(_k_upcoming(sport, league), ttl):
        return 0
    rows = (
        db.session.query(Event.start_time)
        .filter(
            Event.sport == sport,
            Event.league == league,
            Event.status == SCHEDULED,
            Event.start_time >= now,
            Event.start_time <= now + _UPCOMING_WINDOW,
        )
        .all()
    )
    dates = {(start - timedelta(hours=6)).date() for (start,) in rows}
    n = 0
    failed = None
    try:
        for _, board in _scoreboards(sport, league, dates):
            if isinstance(board, Exception):
                failed = failed or board
                continue
            n += _ingest_events(board.get("events"), sport, league)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    if failed:
        raise failed
    _mark(_k_upcoming(sport, league))
    return n


def rescore_dates(start, end) -> dict:
    """Re-read every registered league's ESPN board for each day in [start, end]
    and upsert, overwriting whatever we stored — the repair for results written
    while score refresh was down (e.g. games the reaper closed as 0-0 draws).
    Each league/day commits on its own; failed days are listed under
    ``"failed"`` so the caller can exit non-zero."""
    out = {"failed": []}
    for entry in LEAGUE_REGISTRY:
        sport, league = entry["sport"], entry["league"]
        n = 0
        days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
        for day, board in _scoreboards(sport, league, days):
            try:
                if isinstance(board, Exception):
                    raise board
                n += _ingest_events(board.get("events"), sport, league)
                db.session.commit()
            except Exception as exc:  # noqa: BLE001 — one bad day shouldn't sink the rest
                db.session.rollback()
                current_app.logger.warning("rescore %s/%s %s: %s", sport, league, day, exc)
                out["failed"].append(f"{sport}/{league} {day}")
        out[f"{sport}/{league}"] = n
    return out


# How far back refresh_scores re-checks unresolved games, and the most extra
# dates it will fetch in one pass (each is one ESPN request).
_CATCHUP_WINDOW = timedelta(days=3)
_CATCHUP_MAX_DATES = 6


def _stuck_dates(sport, league, now):
    """Board dates (the UTC start date and the day before, since ESPN buckets by
    local date) of games in this league still scheduled/live after they must
    have ended."""
    maxdur = _MAX_GAME_DURATION.get(sport, timedelta(hours=5))
    rows = (
        db.session.query(Event.start_time)
        .filter(
            Event.sport == sport,
            Event.league == league,
            Event.status.in_([SCHEDULED, LIVE]),
            Event.start_time < now - maxdur,
            Event.start_time > now - _CATCHUP_WINDOW,
        )
        .all()
    )
    out = set()
    for (start,) in rows:
        out.add(start.date())
        out.add((start - timedelta(days=1)).date())
    return set(sorted(out, reverse=True)[:_CATCHUP_MAX_DATES])


# One league's fixture pass per tick, guarded by a Redis lease. Doing all
# leagues in one thread let a slow first-run league (college football caches
# hundreds of team logos to S3) starve the in-season leagues behind it, and a
# dead worker never released an in-process flag. A Redis lease with a TTL is
# single-flight across workers AND self-heals: if the worker dies mid-ingest the
# lease simply expires and the next tick resumes.
_FX_LEASE_KEY = "sched:fx_lease"
_FX_LEASE_TTL = 900  # 15 min — comfortably longer than any single league's pass

# A week's end is the last game's start plus enough slack for it to finish, so a
# period stays open until its games are gradable (rollover flips it FINAL at end,
# and grading only runs on open periods) and week scoping still catches that game.
_GAME_BUFFER = timedelta(hours=6)


def _run_one_fixture_bg(app, sport, league):
    with app.app_context():
        try:
            n = refresh_fixtures(sport, league)
            if n:
                app.logger.info("schedule fixtures %s/%s: %s events", sport, league, n)
        except Exception as exc:  # noqa: BLE001
            db.session.rollback()
            app.logger.warning("schedule fixtures %s/%s: %s", sport, league, exc)
        finally:
            get_redis().delete(_FX_LEASE_KEY)


def _maybe_start_fixtures():
    """Kick off the next due league's fixture pass in the background (one per
    tick) if the single-flight lease is free. Returns a status string."""
    app = current_app._get_current_object()
    ttl = app.config["SCHEDULE_FIXTURE_TTL"]
    due = [e for e in LEAGUE_REGISTRY if _stale(_k_fixtures(e["sport"], e["league"]), ttl)]
    if not due:
        return "idle"
    # NX claim; the TTL means a crashed run's lease frees itself.
    if not get_redis().set(_FX_LEASE_KEY, "1", nx=True, ex=_FX_LEASE_TTL):
        return "running"
    entry = due[0]
    threading.Thread(
        target=_run_one_fixture_bg, args=(app, entry["sport"], entry["league"]), daemon=True
    ).start()
    return "started"


# /internal/tick used to run every job inside the scheduler's HTTP request: on
# 0.125 vCPU it outran the proxy timeout (504s) and held request threads the
# public /events routes need. It now starts the pass in a background thread
# under a Redis lease (one pass at a time, self-freeing if the worker dies) and
# answers at once with the previous pass's result.
_TICK_LEASE_KEY = "sched:tick_lease"
_TICK_LEASE_TTL = 300
_LAST_TICK_KEY = "sched:last_tick"


def start_tick() -> dict:
    """Kick off a tick in the background unless one is already running.
    Returns the last completed pass's counts plus this call's state."""
    r = get_redis()
    try:
        last = json.loads(r.get(_LAST_TICK_KEY) or "{}")
    except (TypeError, ValueError):
        last = {}
    if not r.set(_TICK_LEASE_KEY, "1", nx=True, ex=_TICK_LEASE_TTL):
        return {**last, "state": "running"}
    app = current_app._get_current_object()
    threading.Thread(target=_run_tick_bg, args=(app,), daemon=True).start()
    return {**last, "state": "started"}


def _run_tick_bg(app):
    with app.app_context():
        started = time.time()
        try:
            result = tick()
            result["secs"] = round(time.time() - started, 1)
            get_redis().set(_LAST_TICK_KEY, json.dumps(result))
        except Exception as exc:  # noqa: BLE001
            db.session.rollback()
            app.logger.warning("tick failed: %s", exc)
        finally:
            get_redis().delete(_TICK_LEASE_KEY)


def tick():
    """Scheduler entry point. One due league's fixture pass (weekly) runs in the
    background so the request returns fast; scores (5 min, one board fetch per
    league) run inline and cheaply, each league isolated so one failure never
    blocks the rest."""
    fixtures_state = _maybe_start_fixtures()
    scores = 0
    for entry in LEAGUE_REGISTRY:
        sport, league = entry["sport"], entry["league"]
        try:
            scores += refresh_scores(sport, league)
        except Exception as exc:  # noqa: BLE001
            current_app.logger.warning("schedule scores %s/%s: %s", sport, league, exc)
    # Next week's boards, hourly: keeps ESPN's lines (and reschedules) current
    # for games that aren't on today's board yet.
    upcoming = 0
    for entry in LEAGUE_REGISTRY:
        sport, league = entry["sport"], entry["league"]
        try:
            upcoming += refresh_upcoming(sport, league)
        except Exception as exc:  # noqa: BLE001
            current_app.logger.warning("schedule upcoming %s/%s: %s", sport, league, exc)
    # Odds ride on the same events; refresh is quota-gated internally. Local
    # import avoids a circular dependency (service_odds imports this module).
    odds = 0
    try:
        from app.services import service_odds
        odds = service_odds.refresh_all_odds()
    except Exception as exc:  # noqa: BLE001
        current_app.logger.warning("odds refresh: %s", exc)
    # Combat (MMA) ingests each fight as a home/away Event; field sports (golf,
    # racing) ingest each tournament as a matchup-container Event. Both are
    # self-gated so most ticks read cache, and isolated so a failure never
    # blocks the tick.
    combat = 0
    try:
        from app.services import service_combat
        combat = service_combat.tick()
    except Exception as exc:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.warning("combat sync: %s", exc)
    field = 0
    try:
        from app.services import service_field
        field = service_field.tick()
    except Exception as exc:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.warning("field sync: %s", exc)
    try:
        reaped = reap_stale_events()
    except Exception as exc:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.warning("reap stale events: %s", exc)
        reaped = 0
    try:
        from app.services import service_quota
        service_quota.log_hourly()
    except Exception as exc:  # noqa: BLE001 — reporting must never break the tick
        current_app.logger.warning("quota report: %s", exc)
    return {
        "fixtures": fixtures_state, "scores": scores, "upcoming": upcoming, "odds": odds,
        "combat": combat, "field": field, "reaped": reaped,
    }


# Games clearly finished but never marked so. refresh_scores only re-fetches
# TODAY's board, and ESPN drops old games from the scoreboard, so an event whose
# final-status flip is missed can stay 'scheduled'/'live' forever. Sweep anything
# still scheduled/live well past its start:
#   * If we saw it LIVE with a score, the game plainly finished (ESPN just never
#     flipped it to 'final') — finalize it and derive the winner from the score.
#     Never void a played game: that would strand Pick'em picks and refund live
#     wagers.
#   * A game we never saw start is NOT scored: ESPN's pre-game board reports
#     "0" for both teams, so trusting it turned every missed game into a 0-0
#     draw (2026-09-15..18). Leave it for refresh_scores' catch-up, and only
#     after that window lapses call it 'cancelled' (void-refunds H2H, voids
#     Pick'em picks, no contest).
# The grace comfortably exceeds any real game length, so a genuinely live game is
# never mis-reaped.
_STALE_EVENT_GRACE = timedelta(hours=12)


def reap_stale_events() -> int:
    now = datetime.utcnow()
    stuck = (
        Event.query
        .filter(
            or_(
                and_(Event.status == LIVE, Event.start_time < now - _STALE_EVENT_GRACE),
                and_(Event.status == SCHEDULED, Event.start_time < now - _CATCHUP_WINDOW),
            )
        )
        .all()
    )
    n = 0
    for ev in stuck:
        if ev.status == LIVE and ev.home_score is not None and ev.away_score is not None:
            ev.status = FINAL
            if ev.home_score > ev.away_score:
                ev.winner_side = "home"
            elif ev.away_score > ev.home_score:
                ev.winner_side = "away"
            else:
                ev.winner_side = "draw"
        else:
            ev.status = CANCELLED
        n += 1
    if n:
        db.session.commit()
    return n


# A game still 'live'/'scheduled' this long after kickoff is certainly over, so
# refresh_scores re-reads its board date (_stuck_dates). Comfortably longer than
# any real game (incl. OT / delays). Team sports only; field (golf, racing) and
# combat (mma) have their own handlers.
_MAX_GAME_DURATION = {
    "football": timedelta(hours=5),
    "basketball": timedelta(hours=4),
    "baseball": timedelta(hours=6),
    "hockey": timedelta(hours=4),
    "soccer": timedelta(hours=3),
}


# ---------------------------------------------------------------- weeks endpoint
def weeks(sport, league, season=None):
    """The week list for a league, derived from stored events: native weeks by
    week_number, date-based by Mon–Sun calendar buckets. Feeds Phase 2 period
    prebuild."""
    if not availability.is_enabled(sport):
        return {"weeks": []}, 200
    entry = _registry_entry(sport, league)
    q = Event.query.filter_by(sport=sport, league=league)
    if season:
        try:
            q = q.filter(Event.season_year == int(season))
        except (TypeError, ValueError):
            pass
    events = q.all()

    if entry and entry["strategy"] == "native_week":
        # ESPN's week.number resets per season type (preseason wk1, regular wk1
        # and postseason wk1 all == 1), so the label ("Preseason Week 1",
        # "Week 1", "Hall of Fame Weekend") is the unique week identity — bucket
        # on that, ordered by when the week actually starts.
        buckets = {}
        for e in events:
            key = e.week_label or (f"Week {e.week_number}" if e.week_number is not None else None)
            if key is None:
                continue
            b = buckets.setdefault(
                key,
                {"label": key, "week": e.week_number, "start": None, "end": None, "count": 0},
            )
            b["count"] += 1
            if e.start_time:
                if b["start"] is None or e.start_time < b["start"]:
                    b["start"] = e.start_time
                if b["end"] is None or e.start_time > b["end"]:
                    b["end"] = e.start_time
        ordered = sorted(
            buckets.values(),
            key=lambda x: (x["start"] is None, x["start"] or datetime.max),
        )
        out = [
            {
                "week": b["week"],
                "label": b["label"],
                "start": b["start"].isoformat() + "Z" if b["start"] else None,
                "end": (b["end"] + _GAME_BUFFER).isoformat() + "Z" if b["end"] else None,
                "count": b["count"],
            }
            for b in ordered
        ]
        return {"weeks": out}, 200

    # date-based -> Monday-anchored calendar weeks. End = the week's last game
    # start + buffer (not Sunday-midnight, which would cut off Sunday's games).
    buckets = {}
    for e in events:
        if not e.start_time:
            continue
        monday = e.start_time.date() - timedelta(days=e.start_time.weekday())
        b = buckets.setdefault(monday, {"count": 0, "last": None})
        b["count"] += 1
        if b["last"] is None or e.start_time > b["last"]:
            b["last"] = e.start_time
    out = []
    for i, monday in enumerate(sorted(buckets), start=1):
        b = buckets[monday]
        start_dt = datetime(monday.year, monday.month, monday.day)
        end_dt = (b["last"] or start_dt) + _GAME_BUFFER
        out.append({
            "week": i,
            "label": f"Week of {monday.strftime('%b %d')}",
            "start": start_dt.isoformat() + "Z",
            "end": end_dt.isoformat() + "Z",
            "count": b["count"],
        })
    return {"weeks": out}, 200


def weeks_for_catalog(sport_league_id, season=None):
    """weeks() addressed by the catalog UUID a league stores (it doesn't know the
    sport/league slugs)."""
    row = db.session.get(SportLeague, str(sport_league_id))
    if row is None:
        return {"weeks": []}, 200
    return weeks(row.sport, row.league, season)
