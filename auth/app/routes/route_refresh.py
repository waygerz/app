from flask import Blueprint

from app.controllers import controller_refresh as ctrl

refresh_bp = Blueprint("refresh", __name__)


@refresh_bp.post("/refresh")
def refresh():
    return ctrl.refresh()