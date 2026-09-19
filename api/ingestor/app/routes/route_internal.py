from flask import Blueprint

from app.controllers import controller_internal as ctrl
from app.utils.guards import internal_only

ingestor_internal_bp = Blueprint("internal", __name__)


@ingestor_internal_bp.post("/events/<key>/refresh")
@internal_only
def refresh_event(key):
    return ctrl.refresh_event(key)


@ingestor_internal_bp.post("/tick")
@internal_only
def schedule_tick():
    return ctrl.schedule_tick()


@ingestor_internal_bp.post("/catalog/sync")
@internal_only
def catalog_sync():
    return ctrl.catalog_sync()


@ingestor_internal_bp.get("/quota")
@internal_only
def quota():
    return ctrl.quota()


@ingestor_internal_bp.post("/events/lookup")
@internal_only
def lookup_events():
    return ctrl.lookup_events()


@ingestor_internal_bp.get("/sport-leagues/disabled")
@internal_only
def disabled_sport_leagues():
    return ctrl.disabled_sport_leagues()
