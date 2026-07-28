from flask import Blueprint
from flask_jwt_extended import jwt_required

from app.controllers import controller_feed as ctrl

notifications_feed_bp = Blueprint("feed", __name__)


@notifications_feed_bp.get("/me")
@jwt_required(locations=["cookies", "headers"])
def list_feed():
    return ctrl.list_feed()


@notifications_feed_bp.get("/me/unread-count")
@jwt_required(locations=["cookies", "headers"])
def unread_count():
    return ctrl.unread_count()


@notifications_feed_bp.post("/me/read")
@jwt_required(locations=["cookies", "headers"])
def mark_read():
    return ctrl.mark_read()


@notifications_feed_bp.get("/me/preferences")
@jwt_required(locations=["cookies", "headers"])
def get_preferences():
    return ctrl.get_preferences()


@notifications_feed_bp.put("/me/preferences")
@jwt_required(locations=["cookies", "headers"])
def update_preferences():
    return ctrl.update_preferences()


@notifications_feed_bp.post("/me/devices")
@jwt_required(locations=["cookies", "headers"])
def register_device():
    return ctrl.register_device()


@notifications_feed_bp.delete("/me/devices")
@jwt_required(locations=["cookies", "headers"])
def unregister_device():
    return ctrl.unregister_device()
