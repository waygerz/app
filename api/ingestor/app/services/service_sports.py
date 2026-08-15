"""Sports catalog API client, teams sync, and sports endpoints."""
import json
import time
from datetime import datetime

import requests
from flask import current_app
from sqlalchemy import text

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

# Bettable sports that come from the ESPN ingester rather than RTS, so they
# aren't in RTS's `/sports` catalog. Surfaced in list_sports/list_leagues so the
# league-create picker offers them; their events reach the Event table via
# service_combat (MMA fights -> home/away). `slug` matches the (sport, league)
# used at ingest time so catalog_id() lines up. Keep in sync with
# service_combat.COMBAT_SPORTS and the *_TOURS config.
# TEMPORARILY DISABLED: golf/racing/MMA are hidden from list_sports/list_leagues
# (the league-create picker and the /sports browse) for now. Re-enable by setting
# EXTRA_SPORTS = _EXTRA_SPORTS_DISABLED below. Keep in sync with the *_TOURS
# config allowlists (also emptied) so ingestion and surfacing toggle together.
_EXTRA_SPORTS_DISABLED = [
    {
        "slug": "mma",
        "name": "MMA",
        "leagues": [
            {"slug": "ufc", "name": "UFC"},
            {"slug": "pfl", "name": "PFL"},
        ],
    },
    {
        "slug": "golf",
        "name": "Golf",
        "leagues": [
            {"slug": "pga", "name": "PGA Tour"},
        ],
    },
    {
        "slug": "racing",
        "name": "Racing",
        "leagues": [
            {"slug": "f1", "name": "Formula 1"},
            {"slug": "nascar-premier", "name": "NASCAR"},
            {"slug": "irl", "name": "IndyCar"},
        ],
    },
]
EXTRA_SPORTS = []


def _extra_sport(sport):
    return next((s for s in EXTRA_SPORTS if s["slug"] == sport), None)


def _extra_sports_payload():
    return [
        {"id": s["slug"], "slug": s["slug"], "name": s["name"], "displayName": s["name"]}
        for s in EXTRA_SPORTS
    ]


class SportsAPIError(Exception):
    pass


class QuotaExceeded(SportsAPIError):
    pass


def _headers():
    return {"Authorization": f"Bearer {current_app.config['SPORTS_API_KEY']}"}


def _mark_called():
    get_redis().set(LAST_CALL_KEY, time.time())


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


# Persistent "last known good" snapshot per path, written on every successful
# fetch and served (stale) whenever a live call is unavailable — so a quota-out
# or API blip degrades to slightly-stale data instead of a hard error.
LKG_PREFIX = "sports:lkg:"


def _adaptive_min_interval():
    """Seconds to wait between live calls so the *remaining* monthly budget lasts
    until the quota resets: interval = time_to_reset / remaining_budget. Returns
    None when the budget is spent (caller must not call live), and falls back to
    MIN_INTERVAL_SEC when the quota is not yet known (cold start)."""
    r = get_redis()
    remaining, reset = r.get(REMAINING_KEY), r.get(RESET_KEY)
    if remaining is None or reset is None:
        return MIN_INTERVAL_SEC
    try:
        budget = int(remaining) - current_app.config["SPORTS_QUOTA_FLOOR"]
        secs_to_reset = float(reset) / 1000.0 - time.time()
    except (TypeError, ValueError):
        return MIN_INTERVAL_SEC
    if budget <= 0:
        return None  # spent for the month — serve stale only
    if secs_to_reset <= 0:
        return MIN_INTERVAL_SEC  # past reset; meta refreshes on next success
    interval = secs_to_reset / budget
    return max(MIN_INTERVAL_SEC, min(interval, current_app.config["SPORTS_MAX_INTERVAL"]))


def _pace_allows_live():
    """Non-blocking budget governor: True only if enough time has passed since the
    last call to keep the monthly budget on pace. Never sleeps — a throttled call
    serves cache/stale instead of blocking a worker."""
    interval = _adaptive_min_interval()
    if interval is None:
        return False  # budget exhausted for the month
    last = get_redis().get(LAST_CALL_KEY)
    if last is not None and (time.time() - float(last)) < interval:
        return False
    return True


def _fetch_live(path, ttl):
    _check_quota()
    _mark_called()
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
    r = get_redis()
    r.setex(CACHE_PREFIX + path, ttl, json.dumps(data))
    r.set(LKG_PREFIX + path, json.dumps(data))  # last known good — no expiry
    return data


def get(path, ttl=None, force=False):
    """Cache-first catalog fetch with an adaptive budget governor + stale fallback.
    Order: fresh cache -> (budget-paced) live call -> last-known-good stale."""
    r = get_redis()

    if not force:
        cached = r.get(CACHE_PREFIX + path)
        if cached is not None:
            return json.loads(cached)

    if force or _pace_allows_live():
        try:
            return _fetch_live(path, ttl)
        except SportsAPIError:
            if force:
                raise
            # fall through to stale on any live failure (quota / HTTP / etc.)

    stale = r.get(LKG_PREFIX + path)
    if stale is not None:
        return json.loads(stale)
    raise SportsAPIError(
        f"catalog unavailable for {path}: no cache and live fetch is budget/paced-out"
    )


def fetch_sports(force=False):
    return get("/sports", ttl=current_app.config["SPORTS_CATALOG_TTL"], force=force) or []


def fetch_leagues(sport, force=False):
    return get(
        f"/sports/{sport}/leagues",
        ttl=current_app.config["SPORTS_CATALOG_TTL"],
        force=force,
    ) or []


def fetch_league_events(sport, league, force=False):
    return get(f"/sports/{sport}/leagues/{league}/events", force=force) or []


def fetch_event(sport, league, event_id, force=False):
    return get(f"/sports/{sport}/leagues/{league}/events/{event_id}", force=force)


def fetch_teams(sport, league, force=False):
    return get(
        f"/sports/{sport}/leagues/{league}/teams",
        ttl=current_app.config["SPORTS_CATALOG_TTL"],
        force=force,
    ) or []


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


# Both the score tick (_cache_event_teams) and the background fixtures thread
# (sync_teams) upsert overlapping teams.last_synced_at rows in different orders,
# which deadlocks. A single transaction-scoped Postgres advisory lock makes any
# team-writing transaction take turns; released automatically on commit/rollback.
_TEAM_WRITE_LOCK_KEY = 915623


def acquire_team_write_lock():
    db.session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _TEAM_WRITE_LOCK_KEY})


def sync_teams(sport, league, force=False):
    raw_teams = fetch_teams(sport, league, force=force)
    if not raw_teams:
        return 0
    acquire_team_write_lock()  # serialize with the score-tick team upserts
    count = 0
    for raw in raw_teams:
        fields = parse_team(raw, sport, league)
        if not fields["external_id"] or not fields["name"]:
            continue
        upsert_team(fields)
        count += 1
    db.session.commit()
    return count


def _sports_from_db():
    """Deepest fallback: the sports we've already persisted (distinct SportLeague
    rows). Names derive from the slug — used only when both the live API and the
    cached snapshot are unavailable."""
    out = []
    for (slug,) in db.session.query(SportLeague.sport).distinct().all():
        if not slug:
            continue
        name = slug.replace("-", " ").title()
        out.append({"id": slug, "slug": slug, "name": name, "displayName": name})
    return out


def _leagues_from_db(sport):
    rows = SportLeague.query.filter_by(sport=sport).all()
    return [
        {"slug": r.league, "name": r.name or r.league, "abbreviation": r.name or r.league}
        for r in rows
        if r.league
    ]


def list_sports():
    try:
        data = list(fetch_sports())
    except Exception:
        data = _sports_from_db()  # durable floor if the cached snapshot is gone too
    data.extend(_extra_sports_payload())
    if not data:
        return {"error": "sports catalog unavailable"}, 502
    return {"sports": data, "quota": quota_status()}, 200


def _list_extra_leagues(extra):
    """Static league list for an ESPN-ingested sport (MMA), each stamped with its
    catalog id so the picker stores the same sport_league_id its events carry."""
    leagues = []
    for lg in extra["leagues"]:
        sid = catalog_id(extra["slug"], lg["slug"], lg["name"])
        row = db.session.get(SportLeague, sid)
        if row is not None and row.logo is None:
            row.logo = cache_logo(league_logo_url(lg["slug"]) or "") or ""
        leagues.append({
            "id": f"{extra['slug']}:{lg['slug']}",
            "slug": lg["slug"],
            "name": lg["name"],
            "abbreviation": lg.get("abbreviation") or lg["name"],
            "sport_league_id": sid,
            "logo": (row.logo or None) if row is not None else None,
        })
    db.session.commit()
    return {"leagues": leagues, "quota": quota_status()}, 200


def list_leagues(sport):
    extra = _extra_sport(sport)
    if extra is not None:
        return _list_extra_leagues(extra)
    try:
        data = fetch_leagues(sport)
    except Exception:
        data = _leagues_from_db(sport)  # durable floor if the snapshot is gone too
    if not data:
        return {"error": "leagues catalog unavailable"}, 502
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