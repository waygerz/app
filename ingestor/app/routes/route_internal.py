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