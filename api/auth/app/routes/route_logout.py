from flask import Blueprint

from app.controllers import controller_logout as ctrl

logout_bp = Blueprint("logout", __name__)


@logout_bp.post("/logout")
def logout():
    return ctrl.logout()