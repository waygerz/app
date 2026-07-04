"""Events sync, mock fixtures, and events endpoints."""
import hashlib
import uuid
from datetime import datetime

from flask import current_app, request
from sqlalchemy import nullslast

from app.extensions import db
from app.models.event import CANCELLED, FINAL, LIVE, SCHEDULED, Event
from app.models.team import Team
from app.services import service_sports as sports

_NBA_EVENTS = [
    {
        "id": "mock-nba-1001",
        "name": "Boston Celtics at Los Angeles Lakers",
        "shortName": "BOS @ LAL",
        "date": "2026-06-20T02:30Z",
        "status": {"state": "pre", "completed": False, "detail": "Scheduled"},
        "homeTeam": {"name": "Los Angeles Lakers", "abbreviation": "LAL", "winner": False, "score": None},
        "awayTeam": {"name": "Boston Celtics", "abbreviation": "BOS", "winner": False, "score": None},
    },
    {
        "id": "mock-nba-1002",
        "name": "Golden State Warriors at Denver Nuggets",
        "shortName": "GS @ DEN",
        "date": "2026-06-21T01:00Z",
        "status": {"state": "pre", "completed": False, "detail": "Scheduled"},
        "homeTeam": {"name": "Denver Nuggets", "abbreviation": "DEN", "winner": False, "score": None},
        "awayTeam": {"name": "Golden State Warriors", "abbreviation": "GS", "winner": False, "score": None},
    },
    {
        "id": "mock-nba-1003",
        "name": "Miami Heat at New York Knicks",
        "shortName": "MIA @ NY",
        "date": "2026-06-13T23:00Z",
        "status": {"state": "post", "completed": True, "detail": "Final"},
        "homeTeam": {"name": "New York Knicks", "abbreviation": "NY", "winner": True, "score": 112},
        "awayTeam": {"name": "Miami Heat", "abbreviation": "MIA", "winner": False, "score": 105},
    },
]


def mock_league_events(sport, league):
    if (sport, league) == ("basketball", "nba"):
        return _NBA_EVENTS
    return []


def mock_event_odds(event_id):
    h = int(hashlib.md5(str(event_id).encode()).hexdigest(), 16)
    fav_home = (h % 2) == 0
    spread_pts = 1.5 + (h % 18) * 0.5
    line = -spread_pts if fav_home else spread_pts
    total = 40.5 + (h % 40)
    ml_fav = -(110 + (h % 200))
    ml_dog = 100 + (h % 220)
    return {
        "moneyline": {
            "home": ml_fav if fav_home else ml_dog,
            "away": ml_dog if fav_home else ml_fav,
        },
        "spread": {"line": line, "home": -110, "away": -110},
        "overUnder": {"total": total, "over": -110, "under": -110},
    }


def _parse_dt(value):
    if not value:
        return None
    s = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s).replace(tzinfo=None)
    except ValueError:
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"):
            try:
                return datetime.strptime(value.strip().rstrip("Z"), fmt)
            except ValueError:
                continue
    return None


def _map_status(raw_status):
    st = raw_status or {}
    detail = (st.get("detail") or "").lower()
    if "cancel" in detail or "postpone" in detail:
        return CANCELLED
    state = st.get("state")
    if state == "pre":
        return SCHEDULED
    if state == "in":
        return LIVE
    if state == "post":
        return FINAL
    return SCHEDULED


def parse_event(raw, sport, league):
    home = raw.get("homeTeam") or {}
    away = raw.get("awayTeam") or {}
    status = _map_status(raw.get("status"))

    winner_side = None
    if status == FINAL:
        if home.get("winner"):
            winner_side = "home"
        elif away.get("winner"):
            winner_side = "away"
        else:
            winner_side = "draw"

    return {
        "external_id": str(raw.get("id")) if raw.get("id") is not None else None,
        "sport": sport,
        "league": league,
        "name": raw.get("name"),
        "short_name": raw.get("shortName"),
        "home_team": home.get("name"),
        "home_abbr": home.get("abbreviation"),
        "away_team": away.get("name"),
        "away_abbr": away.get("abbreviation"),
        "start_time": _parse_dt(raw.get("date")),
        "status": status,
        "home_score": home.get("score"),
        "away_score": away.get("score"),
        "winner_side": winner_side,
    }


def upsert_event(fields):
    ev = Event.query.filter_by(external_id=fields["external_id"]).first()
    if ev is None:
        ev = Event(external_id=fields["external_id"])
        db.session.add(ev)
    for key, value in fields.items():
        setattr(ev, key, value)
    ev.sport_league_id = sports.catalog_id(fields["sport"], fields["league"])
    ev.last_synced_at = datetime.utcnow()
    return ev


def attach_logos(events):
    leagues = list({e.league for e in events})
    rows = Team.query.filter(Team.league.in_(leagues)).all() if leagues else []
    by_abbr = {(t.league, (t.abbreviation or "").upper()): t.logo for t in rows}
    by_name = {(t.league, t.name): t.logo for t in rows}

    def logo_for(league, abbr, name):
        return by_abbr.get((league, (abbr or "").upper())) or by_name.get((league, name))

    out = []
    for e in events:
        d = e.to_dict()
        d["home_logo"] = logo_for(e.league, e.home_abbr, e.home_team)
        d["away_logo"] = logo_for(e.league, e.away_abbr, e.away_team)
        out.append(d)
    return out


def sync_league(sport, league, force=False):
    if current_app.config["SPORTS_API_MOCK"]:
        raw_events = mock_league_events(sport, league)
    else:
        raw_events = sports.fetch_league_events(sport, league, force=force)

    count = 0
    for raw in raw_events or []:
        fields = parse_event(raw, sport, league)
        if not fields["external_id"] or not fields["home_team"]:
            continue
        upsert_event(fields)
        count += 1

    db.session.commit()
    return count


def _find_event(key):
    ev = Event.query.filter_by(external_id=key).first()
    if ev is None:
        ev = db.session.get(Event, key)
    return ev


def list_events():
    q = Event.query
    league = request.args.get("league")
    status = request.args.get("status")
    if league:
        q = q.filter_by(league=league)
    if status:
        q = q.filter_by(status=status)
    sport_league_id = request.args.get("sport_league_id")
    if sport_league_id:
        ids = []
        for raw in sport_league_id.split(","):
            sid = raw.strip()
            if not sid:
                continue
            try:
                uuid.UUID(sid)
            except (ValueError, TypeError):
                continue
            ids.append(sid)
        if ids:
            q = q.filter(Event.sport_league_id.in_(ids))
        else:
            return {"events": []}, 200
    limit = min(int(request.args.get("limit", 100)), 500)
    events = q.order_by(nullslast(Event.start_time.asc())).limit(limit).all()
    return {"events": attach_logos(events)}, 200


def league_events(sport, league):
    sync_error = None
    try:
        sync_league(sport, league)
    except Exception as exc:
        sync_error = str(exc)
    try:
        sports.sync_teams(sport, league)
    except Exception:
        pass
    events = (
        Event.query.filter_by(sport=sport, league=league)
        .order_by(nullslast(Event.start_time.asc()))
        .all()
    )
    return {
        "events": attach_logos(events),
        "sync_error": sync_error,
        "quota": sports.quota_status(),
    }, 200


def event_odds(sport, league, event_id):
    ev = Event.query.filter_by(external_id=event_id).first()

    if current_app.config["SPORTS_API_MOCK"]:
        odds = mock_event_odds(event_id)
    else:
        try:
            odds = sports.fetch_odds(sport, league, event_id)
        except Exception as exc:
            if ev and ev.odds:
                return {"odds": ev.odds, "quota": sports.quota_status(), "stale": True}, 200
            return {"error": str(exc)}, 502

    if ev is not None:
        ev.odds = odds
        ev.odds_updated_at = datetime.utcnow()
        db.session.commit()
    return {"odds": odds, "quota": sports.quota_status()}, 200


def get_event(key):
    ev = _find_event(key)
    if not ev:
        return {"error": "event not found"}, 404
    return {"event": attach_logos([ev])[0]}, 200


def sync():
    body = request.get_json(silent=True) or {}
    sport = body.get("sport", current_app.config["DEFAULT_SPORT"])
    league = body.get("league", current_app.config["DEFAULT_LEAGUE"])
    force = bool(body.get("force", False))
    try:
        count = sync_league(sport, league, force=force)
    except Exception as exc:
        return {"error": str(exc)}, 502
    return {
        "synced": count,
        "sport": sport,
        "league": league,
        "quota": sports.quota_status(),
    }, 200