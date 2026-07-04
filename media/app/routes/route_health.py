from flask import Blueprint

from app.controllers import controller_health as ctrl

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health():
    return ctrl.health()