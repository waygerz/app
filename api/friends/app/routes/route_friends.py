from flask import Blueprint

from app.controllers import controller_friends as ctrl

friends_bp = Blueprint("friends", __name__)


@friends_bp.get("/my-code")
def my_code():
    return ctrl.my_code()


@friends_bp.get("/j/<code>")
def resolve_code(code):
    return ctrl.resolve_code(code)


@friends_bp.post("/j/<code>/act")
def act_on_code(code):
    return ctrl.act_on_code(code)


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


@friends_bp.delete("/users/<uuid:user_id>")
def remove_friend(user_id):
    return ctrl.remove_friend(user_id)