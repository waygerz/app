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
  * date_range (NBA, MLB, NHL, soccer) — fetch `?dates={YYYYMMDD}-{YYYYMMDD}`
    over a forward window.

Adding a league is one LEAGUE_REGISTRY line. Slugs match the catalog because RTS
(which the catalog is built from) is itself an ESPN proxy, so ESPN's
`(sport, league)` and `catalog_id(sport, league)` line up automatically.
"""
import threading
import time
from datetime import datetime, timedelta

from flask import current_app

from app.extensions import db, get_redis
from app.models.event import CANCELLED, FINAL, LIVE, SCHEDULED, Event
from app.services import service_sports as sports
from app.services.service_espn import espn_get
from app.services.service_events import _parse_dt, upsert_event
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


def _ingest_events(raw_events, sport, league, week_label=None):
    count = 0
    for ev in raw_events or []:
        fields = _parse_espn_event(ev, sport, league, week_label)
        if not fields["external_id"] or not fields["home_team"] or not fields["away_team"]:
            continue
        upsert_event(fields)
        _cache_event_teams(ev, sport, league)
        count += 1
    return count


# ---------------------------------------------------------------- fetch
def _scoreboard(sport, league, params=None):
    path = "/scoreboard"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        if qs:
            path += "?" + qs
    return espn_get(sport, league, path)


def _ingest_native(sport, league):
    """Native-week sports: walk the scoreboard calendar's seasontypes -> weeks,
    fetching each week's board and tagging events with the week label. Each week
    commits on its own and rolls back on error, so one bad week neither loses the
    others nor poisons the session for the leagues that follow."""
    sb = _scoreboard(sport, league)
    leagues0 = (sb.get("leagues") or [{}])[0]
    calendar = leagues0.get("calendar") or []
    season = leagues0.get("season") or sb.get("season") or {}
    year = season.get("year")
    total = 0
    for item in calendar:
        if not isinstance(item, dict):
            continue
        seasontype = item.get("value")
        entries = item.get("entries") or []
        for entry in entries:
            week = entry.get("value")
            label = entry.get("label")
            if year is None or seasontype is None or week is None:
                continue
            try:
                board = _scoreboard(
                    sport, league,
                    {"dates": year, "seasontype": seasontype, "week": week},
                )
                total += _ingest_events(board.get("events"), sport, league, week_label=label)
                db.session.commit()
            except Exception as exc:  # one bad week shouldn't sink the rest
                db.session.rollback()
                current_app.logger.warning(
                    "schedule native %s/%s week %s: %s", sport, league, week, exc
                )
    return total


def _ingest_date_range(sport, league):
    """Date-based sports: page a forward window in 14-day chunks, each chunk
    committing independently and rolling back on error."""
    weeks_ahead = current_app.config["SCHEDULE_WEEKS_AHEAD"]
    total_days = weeks_ahead * 7
    start = datetime.utcnow().date()
    total = 0
    step = 14
    day = 0
    while day < total_days:
        d0 = start + timedelta(days=day)
        d1 = start + timedelta(days=min(day + step - 1, total_days - 1))
        dates = f"{d0.strftime('%Y%m%d')}-{d1.strftime('%Y%m%d')}"
        try:
            board = _scoreboard(sport, league, {"dates": dates})
            total += _ingest_events(board.get("events"), sport, league)
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            current_app.logger.warning(
                "schedule range %s/%s %s: %s", sport, league, dates, exc
            )
        day += step
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


def refresh_scores(sport, league, force=False):
    """Re-fetch today's board to update live/final scores (gated ~5 min)."""
    if not force and not _stale(_k_scores(sport, league), current_app.config["SCHEDULE_SCORE_TTL"]):
        return 0
    try:
        board = _scoreboard(sport, league, {"dates": datetime.utcnow().strftime("%Y%m%d")})
        n = _ingest_events(board.get("events"), sport, league)
        db.session.commit()
    except Exception:
        db.session.rollback()  # keep the session clean for the next league
        raise
    _mark(_k_scores(sport, league))
    return n


# One league's fixture pass per tick, guarded by a Redis lease. Doing all
# leagues in one thread let a slow first-run league (college football caches
# hundreds of team logos to S3) starve the in-season leagues behind it, and a
# dead worker never released an in-process flag. A Redis lease with a TTL is
# single-flight across workers AND self-heals: if the worker dies mid-ingest the
# lease simply expires and the next tick resumes.
_FX_LEASE_KEY = "sched:fx_lease"
_FX_LEASE_TTL = 900  # 15 min — comfortably longer than any single league's pass


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
    return {"fixtures": fixtures_state, "scores": scores}


# ---------------------------------------------------------------- weeks endpoint
def weeks(sport, league, season=None):
    """The week list for a league, derived from stored events: native weeks by
    week_number, date-based by Mon–Sun calendar buckets. Feeds Phase 2 period
    prebuild."""
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
                "end": b["end"].isoformat() + "Z" if b["end"] else None,
                "count": b["count"],
            }
            for b in ordered
        ]
        return {"weeks": out}, 200

    # date-based -> Monday-anchored calendar weeks
    buckets = {}
    for e in events:
        if not e.start_time:
            continue
        monday = e.start_time.date() - timedelta(days=e.start_time.weekday())
        b = buckets.setdefault(monday, 0)
        buckets[monday] = b + 1
    out = []
    for i, monday in enumerate(sorted(buckets), start=1):
        end = monday + timedelta(days=6)
        out.append({
            "week": i,
            "label": f"Week of {monday.strftime('%b %d')}",
            "start": monday.isoformat(),
            "end": end.isoformat(),
            "count": buckets[monday],
        })
    return {"weeks": out}, 200
