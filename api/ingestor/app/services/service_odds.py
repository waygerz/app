"""The Odds API → prices for the ESPN team events (H2H betting).

The event backbone is ESPN (service_schedule); odds come from a different feed
with its own ids, so they're joined by content: the unordered set of normalized
team names + the game date. A match writes the normalized `odds` block the FE
and contests already consume (moneyline / spread / overUnder) onto Event.odds — a
miss simply leaves odds absent (the event still renders and settles).

A /odds call costs markets x regions credits (3 as configured: h2h, spreads,
totals from DraftKings). The plan is spent evenly rather than capped by a fixed
TTL: refresh_interval() turns the plan (used + remaining, from the response
headers) into a daily budget of plan/31 and shares it across the leagues that
have games inside the lookahead window — ~30 min per league on the 20K plan
with five leagues in season. Only leagues with games to price spend credits, and
nothing is spent below ODDS_QUOTA_FLOOR. ESPN's scoreboard carries the same
DraftKings line for free (service_schedule._espn_odds); whichever refreshed
last wins.
"""
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta

import requests
from flask import current_app

from app.extensions import db, get_redis
from app.models.event import SCHEDULED, Event
from app.services.service_events import _parse_dt
from app.services.service_schedule import LEAGUE_REGISTRY, _mark, _stale

# Our (sport, league) -> The Odds API sport_key.
ODDS_SPORT_KEYS = {
    ("football", "nfl"): "americanfootball_nfl",
    ("football", "college-football"): "americanfootball_ncaaf",
    ("basketball", "nba"): "basketball_nba",
    ("baseball", "mlb"): "baseball_mlb",
    ("hockey", "nhl"): "icehockey_nhl",
    ("soccer", "eng.1"): "soccer_epl",
    ("soccer", "usa.1"): "soccer_usa_mls",
}

_QUOTA_KEY = "odds:quota:remaining"
_USED_KEY = "odds:quota:used"


# ---------------------------------------------------------------- matching
def _norm(name):
    """lowercase, strip accents + punctuation, collapse whitespace — so the two
    feeds' names compare equal."""
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", str(name))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return " ".join(s.split())


def _pair_key(home, away):
    return frozenset({_norm(home), _norm(away)})


def _book_odds(oa_event, home_team, away_team):
    """First bookmaker's markets -> the normalized odds block, mapping outcome
    names back to home/away."""
    books = oa_event.get("bookmakers") or []
    if not books:
        return None
    bk = books[0]
    nh, na = _norm(home_team), _norm(away_team)
    out = {
        "source": "odds_api",
        "book": bk.get("key"),
        "fetched_at": datetime.utcnow().isoformat() + "Z",
    }
    for m in bk.get("markets") or []:
        key = m.get("key")
        outcomes = m.get("outcomes") or []
        if key == "h2h":
            ml = {}
            for o in outcomes:
                on = _norm(o.get("name"))
                if on == nh:
                    ml["home"] = o.get("price")
                elif on == na:
                    ml["away"] = o.get("price")
            if ml:
                out["moneyline"] = ml
        elif key == "spreads":
            sp = {}
            for o in outcomes:
                on = _norm(o.get("name"))
                if on == nh:
                    sp["home"] = o.get("price")
                    sp["line"] = o.get("point")
                elif on == na:
                    sp["away"] = o.get("price")
            if sp:
                out["spread"] = sp
        elif key == "totals":
            ou = {}
            for o in outcomes:
                nm = (o.get("name") or "").lower()
                if nm == "over":
                    ou["over"] = o.get("price")
                    ou["total"] = o.get("point")
                elif nm == "under":
                    ou["under"] = o.get("price")
            if ou:
                out["overUnder"] = ou
    return out if any(k in out for k in ("moneyline", "spread", "overUnder")) else None


# ---------------------------------------------------------------- fetch + quota
# Last-seen quota headers. They expire so a monthly reset is picked up on its own
# (a stale "remaining <= floor" used to stop odds for good), and are refreshed
# by every paid call.
_QUOTA_TTL = 6 * 3600


def _quota():
    """(remaining, used) from the last response, or (None, None) if unknown."""
    r = get_redis()
    out = []
    for key in (_QUOTA_KEY, _USED_KEY):
        try:
            v = r.get(key)
            out.append(int(v) if v is not None else None)
        except (TypeError, ValueError):
            out.append(None)
    return tuple(out)


def _quota_ok():
    rem, _ = _quota()
    return rem is None or rem > current_app.config["ODDS_QUOTA_FLOOR"]


def _record_quota(resp):
    r = get_redis()
    for header, key in (("x-requests-remaining", _QUOTA_KEY), ("x-requests-used", _USED_KEY)):
        val = resp.headers.get(header)
        if val is not None:
            try:
                r.setex(key, _QUOTA_TTL, int(float(val)))
            except (TypeError, ValueError):
                pass


def _credits_per_call():
    cfg = current_app.config
    markets = len([m for m in cfg["ODDS_API_MARKETS"].split(",") if m.strip()])
    if cfg["ODDS_API_BOOKMAKERS"]:
        # Every 10 bookmakers bill as one region.
        n = len([b for b in cfg["ODDS_API_BOOKMAKERS"].split(",") if b.strip()])
        regions = max(1, -(-n // 10))
    else:
        regions = len([g for g in cfg["ODDS_API_REGIONS"].split(",") if g.strip()])
    return max(1, markets * regions)


def refresh_interval(active_leagues):
    """Seconds between one league's refreshes so the whole plan is spent evenly:
    a daily budget of plan/31 credits (plan = used + remaining from the headers,
    else ODDS_MONTHLY_CREDITS) shared by the leagues that have games to price.
    Dividing by 31 can't overrun any billing month, whatever its reset day.
    Clamped to [ODDS_MIN_INTERVAL, ODDS_REFRESH_TTL]."""
    cfg = current_app.config
    rem, used = _quota()
    plan = (rem + used) if rem is not None and used is not None else cfg["ODDS_MONTHLY_CREDITS"]
    daily = max(plan - cfg["ODDS_QUOTA_FLOOR"], 1) / 31
    calls_per_league = daily / (_credits_per_call() * max(active_leagues, 1))
    interval = 86400 / calls_per_league if calls_per_league > 0 else cfg["ODDS_REFRESH_TTL"]
    return int(min(max(interval, cfg["ODDS_MIN_INTERVAL"]), cfg["ODDS_REFRESH_TTL"]))


def fetch_odds_events(sport_key, ttl):
    """Raw /odds for a sport_key, cached for ``ttl`` so a retry inside the window
    can't re-spend. Returns [] on quota floor / API miss (odds stay absent)."""
    cfg = current_app.config
    r = get_redis()
    cache_key = f"odds:raw:{sport_key}"
    cached = r.get(cache_key)
    if cached:
        try:
            return json.loads(cached)
        except (TypeError, ValueError):
            pass
    if not cfg["ODDS_API_KEY"] or not _quota_ok():
        return []
    params = {
        "apiKey": cfg["ODDS_API_KEY"],
        "markets": cfg["ODDS_API_MARKETS"],
        "oddsFormat": "american",
    }
    if cfg["ODDS_API_BOOKMAKERS"]:
        params["bookmakers"] = cfg["ODDS_API_BOOKMAKERS"]
    else:
        params["regions"] = cfg["ODDS_API_REGIONS"]
    try:
        resp = requests.get(
            f"{cfg['ODDS_API_BASE']}/sports/{sport_key}/odds",
            params=params,
            timeout=cfg["ODDS_TIMEOUT"],
        )
    except Exception as exc:  # noqa: BLE001
        current_app.logger.warning("odds fetch %s: %s", sport_key, exc)
        return []
    _record_quota(resp)
    if resp.status_code != 200:
        current_app.logger.warning("odds fetch %s: HTTP %s", sport_key, resp.status_code)
        return []
    data = resp.json()
    r.setex(cache_key, max(ttl - 60, 60), json.dumps(data))
    return data


# ---------------------------------------------------------------- linker
def _upcoming(league, now):
    horizon = now + timedelta(hours=current_app.config["ODDS_LOOKAHEAD_HOURS"])
    return Event.query.filter(
        Event.league == league,
        Event.status == SCHEDULED,
        Event.start_time >= now,
        Event.start_time <= horizon,
    ).all()


def refresh_league_odds(sport, league, force=False, interval=None, upcoming=None):
    """Price this league's upcoming games (within the lookahead window) from The
    Odds API, matched by team-set + nearest date. Gated per league at
    ``interval`` (see refresh_interval). The gate is marked on a miss too, so a
    failing API waits out the interval instead of retrying every tick."""
    sport_key = ODDS_SPORT_KEYS.get((sport, league))
    if not sport_key:
        return 0
    interval = interval or current_app.config["ODDS_REFRESH_TTL"]
    gate = f"odds:gate:{sport}:{league}"
    if not force and not _stale(gate, interval):
        return 0

    now = datetime.utcnow()
    if upcoming is None:
        upcoming = _upcoming(league, now)
    if not upcoming:
        _mark(gate)  # nothing to price; don't spend a credit
        return 0

    events = fetch_odds_events(sport_key, interval)
    _mark(gate)
    if not events:
        return 0

    by_pair = defaultdict(list)
    for oa in events:
        by_pair[_pair_key(oa.get("home_team"), oa.get("away_team"))].append(
            (_parse_dt(oa.get("commence_time")), oa)
        )

    matched = 0
    for ev in upcoming:
        candidates = by_pair.get(_pair_key(ev.home_team, ev.away_team))
        if not candidates:
            continue
        best, best_diff = None, None
        for commence, oa in candidates:
            if commence is None:
                continue
            diff = abs((commence - ev.start_time).total_seconds())
            if diff <= 86400 and (best_diff is None or diff < best_diff):
                best, best_diff = oa, diff
        if best is None:
            continue
        odds = _book_odds(best, ev.home_team, ev.away_team)
        if odds:
            ev.odds = odds
            ev.odds_updated_at = now
            matched += 1
    db.session.commit()
    return matched


def refresh_all_odds():
    """Odds pass across every registered league (called from the schedule tick).
    The refresh interval is shared out across the leagues that currently have
    games to price. Each league isolated so one failure never blocks the rest."""
    now = datetime.utcnow()
    pending = {}
    for entry in LEAGUE_REGISTRY:
        sport, league = entry["sport"], entry["league"]
        if (sport, league) in ODDS_SPORT_KEYS:
            pending[(sport, league)] = _upcoming(league, now)
    interval = refresh_interval(sum(1 for evs in pending.values() if evs))
    total = 0
    for (sport, league), evs in pending.items():
        try:
            total += refresh_league_odds(sport, league, interval=interval, upcoming=evs)
        except Exception as exc:  # noqa: BLE001
            db.session.rollback()
            current_app.logger.warning("odds %s/%s: %s", sport, league, exc)
    return total
