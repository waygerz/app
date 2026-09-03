from flask import Blueprint

from app.controllers import controller_internal as ctrl
from app.utils.guards import internal_only

users_internal_bp = Blueprint("internal", __name__)


@users_internal_bp.post("/profiles")
@internal_only
def profiles():
    return ctrl.profiles()


@users_internal_bp.post("/profiles/upsert")
@internal_only
def upsert_profile():
    return ctrl.upsert_profile()


@users_internal_bp.post("/tick")
@internal_only
def tick():
    return ctrl.tick()


@users_internal_bp.post("/purge-user")
@internal_only
def purge_user():
    return ctrl.purge_user()
