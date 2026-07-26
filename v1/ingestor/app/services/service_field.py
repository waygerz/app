"""Field sports (golf, racing) -> durable Event rows so a *tournament* is bettable
as a player/driver head-to-head matchup.

A field event is a tournament with a large field of competitors, which does NOT
fit the two-sided Event shape. But a *matchup bet* on it does: two friends each
back a competitor and the higher finish wins. So we ingest the tournament itself
as a single Event — the bet's container. It has no two fixed sides, so the
tournament label placeholds the NOT NULL home/away columns; the actual
competitors are chosen per-wager (contests overwrites home/away with the two
picks) and the webui reads the field to pick from via the existing
/golf|/racing detail endpoints. Settlement is peer-confirmed like every other
bet, so nothing downstream needs finish-position data.
"""
import time

from flask import current_app

from app.extensions import db, get_redis
from app.models.event import LIVE
from app.services import service_espn as espn
from app.services.service_events import _parse_dt, upsert_event

# The field sports ingested as tournaments. `tours_key` names the Config
# allowlist (GOLF_TOURS, RACING_TOURS). Keep in sync with
# service_sports.EXTRA_SPORTS and the *_TOURS config.
FIELD_SPORTS = [
    {"sport": "golf", "tours_key": "GOLF_TOURS"},
    {"sport": "racing", "tours_key": "RACING_TOURS"},
]

# espn.map_status -> Event status (only IN_PROGRESS differs; Event calls it "live").
_STATUS = {espn.IN_PROGRESS: LIVE}

_SYNC_KEY = "field:sync"


def _event_status(status):
    return _STATUS.get(status, status)


def _tournament_fields(summary):
    """A field-event summary (from _field_build) -> Event upsert fields, or None
    if it's missing the id/name a bet needs."""
    ext = summary.get("external_id")
    name = summary.get("name")
    if not ext or not name:
        return None

    def clip(value, n):
        return value[:n] if isinstance(value, str) and len(value) > n else value

    label = clip(name, 120)  # placeholder for the NOT NULL home/away columns
    short = summary.get("short_name")
    return {
        "external_id": clip(str(ext), 64),
        "sport": summary["sport"],
        "league": summary["league"],
        "name": clip(name, 200),
        "short_name": clip(str(short), 80) if short else None,
        "home_team": label,
        "away_team": label,
        "start_time": _parse_dt(summary.get("start_date")),
        "status": _event_status(summary.get("status")),
    }


def sync_sport(sport, tours):
    """Upsert every tournament in one sport's tours as an Event. Returns the
    number upserted."""
    summaries = espn.field_list(sport, tours) or []
    count = 0
    for summary in summaries:
        fields = _tournament_fields(summary)
        if fields is None:
            continue
        upsert_event(fields)  # stamps sport_league_id via catalog_id()
        count += 1
    return count


def sync_all():
    """Sync every configured field sport/tour. Each tour commits on its own and
    rolls back on error so one bad tour never sinks the rest."""
    total = 0
    for c in FIELD_SPORTS:
        for tour in current_app.config[c["tours_key"]]:
            try:
                total += sync_sport(c["sport"], [tour])
                db.session.commit()
            except Exception as exc:  # noqa: BLE001
                db.session.rollback()
                current_app.logger.warning(
                    "field sync %s/%s: %s", c["sport"], tour, exc
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
    """Scheduler entry point. Gated to at most once per score TTL (~5 min);
    cache-aside means most passes read Redis, not ESPN."""
    if not _stale(current_app.config["SCHEDULE_SCORE_TTL"]):
        return 0
    n = sync_all()
    get_redis().set(_SYNC_KEY, time.time())
    return n
