from flask import Blueprint
from flask_jwt_extended import jwt_required

from app.controllers import controller_wagers as ctrl
from app.utils.guards import internal_only

wagers_bp = Blueprint("wagers", __name__)


@wagers_bp.post("/wagers")
@jwt_required(locations=["cookies", "headers"])
def propose():
    return ctrl.propose()


@wagers_bp.get("/wagers")
@jwt_required(locations=["cookies", "headers"])
def my_wagers():
    return ctrl.my_wagers()


@wagers_bp.get("/wagers/<uuid:wager_id>")
@jwt_required(locations=["cookies", "headers"])
def get_wager(wager_id):
    return ctrl.get_wager(wager_id)


@wagers_bp.post("/wagers/<uuid:wager_id>/accept")
@jwt_required(locations=["cookies", "headers"])
def accept(wager_id):
    return ctrl.accept(wager_id)


@wagers_bp.post("/wagers/<uuid:wager_id>/decline")
@jwt_required(locations=["cookies", "headers"])
def decline(wager_id):
    return ctrl.decline(wager_id)


@wagers_bp.post("/wagers/<uuid:wager_id>/cancel")
@jwt_required(locations=["cookies", "headers"])
def cancel(wager_id):
    return ctrl.cancel(wager_id)


@wagers_bp.post("/wagers/<uuid:wager_id>/confirm")
@jwt_required(locations=["cookies", "headers"])
def confirm(wager_id):
    return ctrl.confirm(wager_id)


@wagers_bp.post("/admin/settle")
@internal_only
def settle_due():
    return ctrl.settle_due()