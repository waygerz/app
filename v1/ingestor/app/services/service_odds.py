"""The Odds API → prices for the ESPN team events (H2H betting).

The event backbone is ESPN (service_schedule); odds come from a different feed
with its own ids, so they're joined by content: the unordered set of normalized
team names + the game date. A match writes the normalized `odds` block the FE
and contests already consume (moneyline / spread / overUnder) onto Event.odds — a
miss simply leaves odds absent (the event still renders and settles).

Quota is the free tier's 500 credits/mo and a /odds call costs 1 credit PER
market, so it's bounded hard: only a league with a game inside the lookahead
window, gated per league (ODDS_REFRESH_TTL), raw response cached, and never below
the quota floor.
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
def _quota_ok():
    rem = get_redis().get(_QUOTA_KEY)
    if rem is None:
        return True
    try:
        return int(rem) > current_app.config["ODDS_QUOTA_FLOOR"]
    except (TypeError, ValueError):
        return True


def _record_quota(resp):
    rem = resp.headers.get("x-requests-remaining")
    if rem is not None:
        try:
            get_redis().set(_QUOTA_KEY, int(float(rem)))
        except (TypeError, ValueError):
            pass


def fetch_odds_events(sport_key):
    """Raw /odds for a sport_key, cached per ODDS_REFRESH_TTL so leagues don't
    re-spend credits. Returns [] on quota floor / API miss (odds stay absent)."""
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
    try:
        resp = requests.get(
            f"{cfg['ODDS_API_BASE']}/sports/{sport_key}/odds",
            params={
                "apiKey": cfg["ODDS_API_KEY"],
                "regions": cfg["ODDS_API_REGIONS"],
                "markets": cfg["ODDS_API_MARKETS"],
                "oddsFormat": "american",
            },
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
    r.setex(cache_key, cfg["ODDS_REFRESH_TTL"], json.dumps(data))
    return data


# ---------------------------------------------------------------- linker
def refresh_league_odds(sport, league, force=False):
    """Price this league's upcoming games (within the lookahead window) from The
    Odds API, matched by team-set + nearest date. Gated per league."""
    sport_key = ODDS_SPORT_KEYS.get((sport, league))
    if not sport_key:
        return 0
    gate = f"odds:gate:{sport}:{league}"
    if not force and not _stale(gate, current_app.config["ODDS_REFRESH_TTL"]):
        return 0

    now = datetime.utcnow()
    horizon = now + timedelta(hours=current_app.config["ODDS_LOOKAHEAD_HOURS"])
    upcoming = (
        Event.query.filter(
            Event.league == league,
            Event.status == SCHEDULED,
            Event.start_time >= now,
            Event.start_time <= horizon,
        ).all()
    )
    if not upcoming:
        _mark(gate)  # nothing imminent to price; don't spend a credit
        return 0

    events = fetch_odds_events(sport_key)
    if not events:
        return 0  # API/quota miss — leave the gate unmarked so we retry

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
    _mark(gate)
    return matched


def refresh_all_odds():
    """Odds pass across every registered league (called from the schedule tick).
    Each league isolated so one failure never blocks the rest."""
    total = 0
    for entry in LEAGUE_REGISTRY:
        sport, league = entry["sport"], entry["league"]
        try:
            total += refresh_league_odds(sport, league)
        except Exception as exc:  # noqa: BLE001
            db.session.rollback()
            current_app.logger.warning("odds %s/%s: %s", sport, league, exc)
    return total
