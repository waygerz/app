from flask import Blueprint

from app.controllers import controller_internal as ctrl
from app.utils.guards import internal_only

internal_bp = Blueprint("internal", __name__)


@internal_bp.post("/verify")
@internal_only
def verify():
    return ctrl.verify()


@internal_bp.post("/purge-user")
@internal_only
def purge_user():
    return ctrl.purge_user()