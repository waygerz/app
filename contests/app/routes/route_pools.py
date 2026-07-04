from flask import Blueprint
from flask_jwt_extended import jwt_required

from app.controllers import controller_pools as ctrl

pools_bp = Blueprint("pools", __name__)


@pools_bp.post("/pools/stake")
@jwt_required(locations=["cookies", "headers"])
def stake():
    return ctrl.stake()


@pools_bp.get("/pools")
@jwt_required(locations=["cookies", "headers"])
def list_pools():
    return ctrl.list_pools()


@pools_bp.get("/pools/<uuid:pool_id>")
@jwt_required(locations=["cookies", "headers"])
def get_pool(pool_id):
    return ctrl.get_pool(pool_id)