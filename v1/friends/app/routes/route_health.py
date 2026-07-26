from flask import Blueprint

from app.controllers import controller_health as ctrl

friends_health_bp = Blueprint("health", __name__)


@friends_health_bp.get("/health")
def health():
    return ctrl.health()