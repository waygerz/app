"""Sports catalog API client, teams sync, and sports endpoints."""
import json
import time
from datetime import datetime

import requests
from flask import current_app

from app.extensions import db, get_redis
from app.models.sport_league import SportLeague
from app.models.team import Team
from app.services.service_logos import cache_logo

CACHE_PREFIX = "sports:cache:"
REMAINING_KEY = "sports:quota:remaining"
RESET_KEY = "sports:quota:reset"
LAST_CALL_KEY = "sports:lastcall"
MIN_INTERVAL_SEC = 1.0

_ESPN_LEAGUE_SLUG = {
    "nba-development": "nba_gleague",
}


class SportsAPIError(Exception):
    pass


class QuotaExceeded(SportsAPIError):
    pass


def _headers():
    return {"Authorization": f"Bearer {current_app.config['SPORTS_API_KEY']}"}


def _throttle():
    r = get_redis()
    last = r.get(LAST_CALL_KEY)
    if last is not None:
        elapsed = time.time() - float(last)
        if elapsed < MIN_INTERVAL_SEC:
            time.sleep(MIN_INTERVAL_SEC - elapsed)
    r.set(LAST_CALL_KEY, time.time())


def _check_quota():
    r = get_redis()
    remaining = r.get(REMAINING_KEY)
    floor = current_app.config["SPORTS_QUOTA_FLOOR"]
    if remaining is not None and int(remaining) <= floor:
        raise QuotaExceeded(
            f"sports API quota remaining ({remaining}) <= floor ({floor}); refusing call"
        )


def _record_meta(meta):
    rl = (meta or {}).get("rateLimit") or {}
    r = get_redis()
    if "remaining" in rl:
        r.set(REMAINING_KEY, rl["remaining"])
    if "reset" in rl:
        r.set(RESET_KEY, rl["reset"])


def get(path, ttl=None, force=False):
    r = get_redis()
    cache_key = CACHE_PREFIX + path

    if not force:
        cached = r.get(cache_key)
        if cached is not None:
            return json.loads(cached)

    _check_quota()
    _throttle()

    base = current_app.config["SPORTS_API_BASE"]
    resp = requests.get(f"{base}{path}", headers=_headers(), timeout=25)
    if resp.status_code != 200:
        raise SportsAPIError(f"HTTP {resp.status_code}: {resp.text[:200]}")

    body = resp.json()
    _record_meta(body.get("meta"))
    if not body.get("success"):
        raise SportsAPIError(f"API returned success=false: {str(body)[:200]}")

    data = body.get("data")
    ttl = current_app.config["SPORTS_CACHE_TTL"] if ttl is None else ttl
    r.setex(cache_key, ttl, json.dumps(data))
    return data


def fetch_sports(force=False):
    return get("/sports", force=force) or []


def fetch_leagues(sport, force=False):
    return get(f"/sports/{sport}/leagues", force=force) or []


def fetch_league_events(sport, league, force=False):
    return get(f"/sports/{sport}/leagues/{league}/events", force=force) or []


def fetch_event(sport, league, event_id, force=False):
    return get(f"/sports/{sport}/leagues/{league}/events/{event_id}", force=force)


def fetch_teams(sport, league, force=False):
    return get(f"/sports/{sport}/leagues/{league}/teams", force=force) or []


def fetch_odds(sport, league, event_id, force=False):
    ttl = current_app.config["SPORTS_ODDS_TTL"]
    return get(
        f"/sports/{sport}/leagues/{league}/events/{event_id}/odds", ttl=ttl, force=force
    )


def quota_status():
    r = get_redis()
    return {"remaining": r.get(REMAINING_KEY), "reset": r.get(RESET_KEY)}


def league_logo_url(league):
    slug = _ESPN_LEAGUE_SLUG.get(league, league)
    url = f"https://a.espncdn.com/i/teamlogos/leagues/500/{slug}.png"
    try:
        resp = requests.get(url, timeout=5, stream=True)
        ok = resp.status_code == 200
        resp.close()
        return url if ok else None
    except requests.RequestException:
        return None


def catalog_id(sport, league, name=None, logo=None):
    row = SportLeague.query.filter_by(sport=sport, league=league).first()
    if row is None:
        row = SportLeague(sport=sport, league=league, name=name or league, logo=logo)
        db.session.add(row)
        db.session.flush()
    elif (name and not row.name) or (logo and not row.logo):
        row.name = row.name or name
        row.logo = row.logo or logo
    return row.id


def _pick_logo(raw):
    logos = raw.get("logos") or []
    if logos and isinstance(logos, list):
        return logos[0].get("href")
    return raw.get("logo")


def parse_team(raw, sport, league):
    return {
        "external_id": str(raw.get("id")) if raw.get("id") is not None else None,
        "sport": sport,
        "league": league,
        "name": raw.get("displayName") or raw.get("name"),
        "abbreviation": raw.get("abbreviation"),
        "slug": raw.get("slug"),
        "location": raw.get("location"),
        "color": raw.get("color"),
        "alternate_color": raw.get("alternateColor"),
        # Mirror into our bucket; memoized, so re-syncs don't re-download and the
        # persisted value stays our URL rather than reverting to the source.
        "logo": cache_logo(_pick_logo(raw)),
    }


def upsert_team(fields):
    team = Team.query.filter_by(
        sport=fields["sport"], league=fields["league"], external_id=fields["external_id"]
    ).first()
    if team is None:
        team = Team(
            sport=fields["sport"], league=fields["league"], external_id=fields["external_id"]
        )
        db.session.add(team)
    for key, value in fields.items():
        setattr(team, key, value)
    team.last_synced_at = datetime.utcnow()
    return team


def sync_teams(sport, league, force=False):
    raw_teams = fetch_teams(sport, league, force=force)
    count = 0
    for raw in raw_teams or []:
        fields = parse_team(raw, sport, league)
        if not fields["external_id"] or not fields["name"]:
            continue
        upsert_team(fields)
        count += 1
    db.session.commit()
    return count


def list_sports():
    try:
        data = fetch_sports()
    except Exception as exc:
        return {"error": str(exc)}, 502
    return {"sports": data, "quota": quota_status()}, 200


def list_leagues(sport):
    try:
        data = fetch_leagues(sport)
    except Exception as exc:
        return {"error": str(exc)}, 502
    for lg in data:
        slug = lg.get("slug")
        if not slug:
            continue
        sid = catalog_id(sport, slug, lg.get("name"))
        lg["sport_league_id"] = sid
        row = db.session.get(SportLeague, sid)
        if row is not None and row.logo is None:
            # Cache the ESPN logo into our bucket on first sight; stored in the
            # row, so later reads just emit our URL (no re-download).
            row.logo = cache_logo(league_logo_url(slug) or "") or ""
        lg["logo"] = (row.logo or None) if row is not None else None
    db.session.commit()
    return {"leagues": data, "quota": quota_status()}, 200


def list_teams(sport, league):
    sync_error = None
    try:
        sync_teams(sport, league)
    except Exception as exc:
        sync_error = str(exc)
    teams = (
        Team.query.filter_by(sport=sport, league=league).order_by(Team.name.asc()).all()
    )
    return {
        "teams": [t.to_dict() for t in teams],
        "sync_error": sync_error,
        "quota": quota_status(),
    }, 200