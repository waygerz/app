"""Internal ingestor endpoints for cross-service calls."""
import uuid
from datetime import datetime, timedelta

from flask import current_app, request

from app.extensions import db
from app.models.event import CANCELLED, FINAL, Event
from app.models.sport_league import SportLeague
from app.services import service_events as events
from app.services import service_sports as sports


def refresh_event(key):
    ev = Event.query.filter_by(external_id=key).first()
    if not ev:
        return {"error": "event not found"}, 404
    # contests calls this for every started, wagered game on every 30s tick. For
    # the ESPN-owned leagues the stored row is already current (live scores
    # refresh each minute, free), so only spend an RTS call when ESPN hasn't
    # touched the game recently — and never on a finished one.
    from app.services.service_schedule import REGISTRY_KEYS

    fresh = timedelta(seconds=current_app.config["EVENT_REFRESH_FRESH"])
    if (ev.sport, ev.league) in REGISTRY_KEYS and (
        ev.status in (FINAL, CANCELLED)
        or (ev.last_synced_at and datetime.utcnow() - ev.last_synced_at < fresh)
    ):
        return {"event": ev.to_dict(), "quota": sports.quota_status()}, 200
    try:
        raw = sports.fetch_event(ev.sport, ev.league, key, priority=True)
    except Exception as exc:
        return {"event": ev.to_dict(), "stale": True, "error": str(exc)}, 200
    if raw:
        fields = events.parse_event(raw, ev.sport, ev.league)
        if fields.get("external_id"):
            events.upsert_event(fields)
            db.session.commit()
            ev = Event.query.filter_by(external_id=key).first()
    return {"event": ev.to_dict(), "quota": sports.quota_status()}, 200


def catalog_sync():
    body = request.get_json(silent=True) or {}
    ids = [str(i) for i in (body.get("sport_league_ids") or []) if i]
    results = []
    for sid in ids:
        try:
            uuid.UUID(sid)
        except (ValueError, TypeError):
            results.append({"sport_league_id": sid, "error": "not a catalog uuid"})
            continue
        cat = db.session.get(SportLeague, sid)
        if not cat:
            results.append({"sport_league_id": sid, "error": "unknown catalog id"})
            continue
        entry = {
            "sport_league_id": sid,
            "sport": cat.sport,
            "league": cat.league,
            "name": cat.name,
        }
        try:
            entry["synced"] = events.sync_league(cat.sport, cat.league)
        except Exception as exc:  # noqa: BLE001
            db.session.rollback()
            entry["error"] = str(exc)
        try:
            sports.sync_teams(cat.sport, cat.league)
        except Exception:  # noqa: BLE001
            db.session.rollback()
        results.append(entry)
    return {"results": results, "quota": sports.quota_status()}, 200