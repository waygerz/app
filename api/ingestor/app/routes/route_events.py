from flask import Blueprint

from app.controllers import controller_events as ctrl
from app.utils.guards import internal_only

ingestor_events_bp = Blueprint("events", __name__)


@ingestor_events_bp.get("/events")
def list_events():
    return ctrl.list_events()


@ingestor_events_bp.get("/schedule/<sport>/<league>/weeks")
def schedule_weeks(sport, league):
    return ctrl.schedule_weeks(sport, league)


@ingestor_events_bp.get("/schedule/by-catalog/<sport_league_id>/weeks")
def schedule_weeks_by_catalog(sport_league_id):
    return ctrl.schedule_weeks_by_catalog(sport_league_id)


@ingestor_events_bp.get("/sports/<sport>/leagues/<league>/events")
def league_events(sport, league):
    return ctrl.league_events(sport, league)


@ingestor_events_bp.get("/sports/<sport>/leagues/<league>/events/<event_id>/odds")
def event_odds(sport, league, event_id):
    return ctrl.event_odds(sport, league, event_id)


@ingestor_events_bp.get("/events/<key>")
def get_event(key):
    return ctrl.get_event(key)


@ingestor_events_bp.post("/events/sync")
@internal_only  # triggers upstream fetches (force=true skips the cache) — ops only
def sync():
    return ctrl.sync()