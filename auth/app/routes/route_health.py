from flask import Blueprint

from app.controllers import controller_health as ctrl

auth_health_bp = Blueprint("health", __name__)


@auth_health_bp.get("/health")
def health():
    return ctrl.health()