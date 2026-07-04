from flask import Blueprint

from app.controllers import controller_internal as ctrl
from app.utils.guards import internal_only

auth_internal_bp = Blueprint("internal", __name__)


@auth_internal_bp.post("/lookup-phone")
@internal_only
def lookup_phone():
    return ctrl.lookup_phone()


@auth_internal_bp.post("/users")
@internal_only
def users():
    return ctrl.users()