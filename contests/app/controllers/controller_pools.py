from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.services import service_pools as service


@jwt_required(locations=["cookies", "headers"])
def stake():
    body, status = service.stake(get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def list_pools():
    body, status = service.list_pools(get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def get_pool(pool_id):
    body, status = service.get_pool(pool_id, get_jwt_identity())
    return jsonify(body), status