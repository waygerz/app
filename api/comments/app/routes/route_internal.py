from flask import Blueprint

from app.controllers import controller_internal as ctrl
from app.utils.guards import internal_only

comments_internal_bp = Blueprint("internal", __name__)


@comments_internal_bp.post("/purge-user")
@internal_only
def purge_user():
    return ctrl.purge_user()
