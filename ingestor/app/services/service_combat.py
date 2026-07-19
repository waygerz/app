"""Combat sports (MMA) -> durable Event rows so they're bettable through the
same head-to-head wager flow as team sports.

An MMA event is a *card*; each fight is a two-sided matchup (fighter A vs B),
which maps 1:1 onto Event.home_team / away_team / winner_side. We reuse
service_espn's cached 1v1 boards — onevone_list warms the card summaries + each
card's board, and onevone_card reads the fights back from that cache — so
ingestion adds no ESPN calls beyond the schedule refresh. Each fight is upserted
as an Event keyed by the fight (competition) id, and reads back through the exact
same `/events` path the league betting UI already uses; nothing downstream
(schedule, wager creation, peer settlement) needs to know MMA is different.
"""
import time

from flask import current_app

from app.extensions import db, get_redis
from app.models.event import FINAL, LIVE
from app.services import service_espn as espn
from app.services.service_events import _parse_dt, upsert_event

# The combat sports ingested as fights. `tours_key` names the Config allowlist
# (e.g. MMA_TOURS = ["ufc", "pfl"]).
COMBAT_SPORTS = [
    {"sport": "mma", "tours_key": "MMA_TOURS"},
]

# espn.map_status -> Event status. Only IN_PROGRESS differs (Event calls it
# "live"); scheduled / final / cancelled are already identical strings.
_STATUS = {espn.IN_PROGRESS: LIVE}

_SYNC_KEY = "combat:sync"


def _event_status(fstatus):
    return _STATUS.get(fstatus, fstatus)


def _fight_fields(card, fight):
    """One 1v1 fight (from _1v1_build) -> Event upsert fields, or None if it's
    missing the fighters/id needed for a two-sided bet."""
    a, b = fight.get("a") or {}, fight.get("b") or {}
    if not fight.get("id") or not a.get("name") or not b.get("name"):
        return None

    status = _event_status(fight.get("status"))
    winner_side = None
    if status == FINAL and fight.get("winner_id"):
        if fight["winner_id"] == a.get("id"):
            winner_side = "home"
        elif fight["winner_id"] == b.get("id"):
            winner_side = "away"

    def clip(value, n):
        return value[:n] if isinstance(value, str) and len(value) > n else value

    weight = fight.get("weight_class")
    return {
        "external_id": clip(str(fight["id"]), 64),
        "sport": card["sport"],
        "league": card["league"],
        "name": clip(f'{a["name"]} vs {b["name"]}', 200),
        "short_name": clip(str(weight), 80) if weight else None,
        "home_team": clip(a["name"], 120),
        "home_abbr": clip(a.get("short_name"), 12) if a.get("short_name") else None,
        "away_team": clip(b["name"], 120),
        "away_abbr": clip(b.get("short_name"), 12) if b.get("short_name") else None,
        "start_time": _parse_dt(card.get("start_date")),
        "status": status,
        "winner_side": winner_side,
    }


def sync_sport(sport, tours):
    """Warm the card schedule + boards for one sport's tours, then upsert every
    fight as an Event. Returns the number of fights upserted."""
    cards = espn.onevone_list(sport, tours) or []
    count = 0
    for card in cards:
        board = espn.onevone_card(sport, tours, card["external_id"])
        if not board:
            continue
        for fight in board.get("fights") or []:
            fields = _fight_fields(card, fight)
            if fields is None:
                continue
            upsert_event(fields)  # stamps sport_league_id via catalog_id()
            count += 1
    return count


def sync_all():
    """Sync every configured combat sport/tour. Each tour commits on its own and
    rolls back on error so one bad card set never sinks the rest."""
    total = 0
    for c in COMBAT_SPORTS:
        for tour in current_app.config[c["tours_key"]]:
            try:
                total += sync_sport(c["sport"], [tour])
                db.session.commit()
            except Exception as exc:  # noqa: BLE001
                db.session.rollback()
                current_app.logger.warning(
                    "combat sync %s/%s: %s", c["sport"], tour, exc
                )
    return total


def _stale(ttl):
    last = get_redis().get(_SYNC_KEY)
    if last is None:
        return True
    try:
        return (time.time() - float(last)) >= ttl
    except (TypeError, ValueError):
        return True


def tick():
    """Scheduler entry point. Gated so we re-ingest at most once per score TTL
    (~5 min); cache-aside means most passes read Redis, not ESPN."""
    if not _stale(current_app.config["SCHEDULE_SCORE_TTL"]):
        return 0
    n = sync_all()
    get_redis().set(_SYNC_KEY, time.time())
    return n
