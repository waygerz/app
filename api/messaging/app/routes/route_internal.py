from flask import Blueprint

from app.controllers import controller_internal as ctrl
from app.utils.guards import internal_only

messaging_internal_bp = Blueprint("internal", __name__)


@messaging_internal_bp.post("/messages")
@internal_only
def post_message():
    return ctrl.post_message()


@messaging_internal_bp.post("/purge-user")
@internal_only
def purge_user():
    return ctrl.purge_user()
