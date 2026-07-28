from flask import Blueprint

from app.controllers import controller_internal as ctrl
from app.utils.guards import internal_only

friends_internal_bp = Blueprint("internal", __name__)


@friends_internal_bp.post("/are-friends")
@internal_only
def are_friends():
    return ctrl.are_friends()