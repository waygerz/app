from flask import Blueprint

from app.controllers import controller_health as ctrl

messaging_health_bp = Blueprint("health", __name__)


@messaging_health_bp.get("/health")
def health():
    return ctrl.health()