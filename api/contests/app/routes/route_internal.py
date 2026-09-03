from flask import Blueprint

from app.controllers import controller_internal as ctrl
from app.utils.guards import internal_only

contests_internal_bp = Blueprint("internal", __name__)


@contests_internal_bp.post("/league-record")
@internal_only
def league_record():
    return ctrl.league_record()


@contests_internal_bp.post("/tick")
@internal_only
def tick():
    return ctrl.tick()


@contests_internal_bp.post("/purge-user")
@internal_only
def purge_user():
    return ctrl.purge_user()