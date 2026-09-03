from flask import Blueprint

from app.controllers import controller_internal as ctrl
from app.utils.guards import internal_only

notifications_internal_bp = Blueprint("internal", __name__)


@notifications_internal_bp.post("/send")
@internal_only
def send():
    return ctrl.send()


@notifications_internal_bp.post("/notify")
@internal_only
def notify():
    return ctrl.notify()


@notifications_internal_bp.post("/preferences")
@internal_only
def set_preferences():
    return ctrl.set_preferences()


@notifications_internal_bp.post("/purge-user")
@internal_only
def purge_user():
    return ctrl.purge_user()