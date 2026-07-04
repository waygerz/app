from flask import Blueprint

from app.controllers import controller_friends as ctrl

friends_bp = Blueprint("friends", __name__)


@friends_bp.get("/users/<uuid:target_id>/invite-preview")
def invite_preview(target_id):
    return ctrl.invite_preview(target_id)


@friends_bp.post("/requests")
def send_request():
    return ctrl.send_request()


@friends_bp.get("/")
def list_friends():
    return ctrl.list_friends()


@friends_bp.get("/requests")
def list_requests():
    return ctrl.list_requests()


@friends_bp.post("/requests/<uuid:req_id>/accept")
def accept(req_id):
    return ctrl.accept(req_id)


@friends_bp.post("/requests/<uuid:req_id>/decline")
def decline(req_id):
    return ctrl.decline(req_id)