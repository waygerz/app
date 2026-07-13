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
        "external_id": str(ev.get("id")) if ev.get("id") is not None else None,
        "sport": sport,
        "league": league,
        "name": ev.get("name"),
        "short_name": ev.get("shortName"),
        "home_team": ht.get("displayName") or ht.get("name"),
        "home_abbr": ht.get("abbreviation"),
        "away_team": at.get("displayName") or at.get("name"),
        "away_abbr": at.get("abbreviation"),
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
        fields["week_label"] = week_label
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
            "external_id": ext,
            "sport": sport,
            "league": league,
            "name": name,
            "abbreviation": t.get("abbreviation"),
            "slug": t.get("slug"),
            "location": t.get("location"),
            "color": t.get("color"),
            "alternate_color": t.get("alternateColor"),
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
    fetching each week's board and tagging events with the week label."""
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
            except Exception as exc:  # one bad week shouldn't sink the rest
                current_app.logger.warning(
                    "schedule native %s/%s week %s: %s", sport, league, week, exc
                )
                continue
            total += _ingest_events(board.get("events"), sport, league, week_label=label)
    db.session.commit()
    return total


def _ingest_date_range(sport, league):
    """Date-based sports: page a forward window in 14-day chunks."""
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
        except Exception as exc:
            current_app.logger.warning(
                "schedule range %s/%s %s: %s", sport, league, dates, exc
            )
        day += step
    db.session.commit()
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
    board = _scoreboard(sport, league, {"dates": datetime.utcnow().strftime("%Y%m%d")})
    n = _ingest_events(board.get("events"), sport, league)
    db.session.commit()
    _mark(_k_scores(sport, league))
    return n


def tick():
    """Scheduler entry point: fixtures (weekly) + scores (5 min) for every
    registered league, each isolated so one league's failure never blocks the
    rest."""
    fixtures = 0
    scores = 0
    for entry in LEAGUE_REGISTRY:
        sport, league = entry["sport"], entry["league"]
        try:
            fixtures += refresh_fixtures(sport, league)
        except Exception as exc:  # noqa: BLE001
            current_app.logger.warning("schedule fixtures %s/%s: %s", sport, league, exc)
        try:
            scores += refresh_scores(sport, league)
        except Exception as exc:  # noqa: BLE001
            current_app.logger.warning("schedule scores %s/%s: %s", sport, league, exc)
    return {"fixtures": fixtures, "scores": scores}


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
        buckets = {}
        for e in events:
            if e.week_number is None:
                continue
            b = buckets.setdefault(
                e.week_number,
                {"week": e.week_number, "label": e.week_label, "start": None, "end": None, "count": 0},
            )
            b["count"] += 1
            if b["label"] is None:
                b["label"] = e.week_label
            if e.start_time:
                if b["start"] is None or e.start_time < b["start"]:
                    b["start"] = e.start_time
                if b["end"] is None or e.start_time > b["end"]:
                    b["end"] = e.start_time
        out = [
            {
                "week": b["week"],
                "label": b["label"] or f"Week {b['week']}",
                "start": b["start"].isoformat() + "Z" if b["start"] else None,
                "end": b["end"].isoformat() + "Z" if b["end"] else None,
                "count": b["count"],
            }
            for b in sorted(buckets.values(), key=lambda x: x["week"])
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
