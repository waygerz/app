from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.services import service_uploads as svc


@jwt_required(locations=["cookies", "headers"])
def presign():
    body, status = svc.presign_upload(get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def complete(asset_id):
    body, status = svc.complete_upload(get_jwt_identity(), asset_id)
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def resolve():
    body, status = svc.resolve_key(request.args.get("key", ""))
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def get_asset(asset_id):
    body, status = svc.get_upload(get_jwt_identity(), asset_id)
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def delete(asset_id):
    body, status = svc.delete_upload(get_jwt_identity(), asset_id)
    return jsonify(body), status