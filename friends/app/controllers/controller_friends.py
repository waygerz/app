from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required, verify_jwt_in_request

from app.services import service_friends as svc


def invite_preview(target_id):
    me = None
    verify_jwt_in_request(optional=True, locations=["cookies", "headers"])
    try:
        me = get_jwt_identity()
    except Exception:  # noqa: BLE001
        me = None
    body, status = svc.invite_preview(me, str(target_id))
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def send_request():
    body, status = svc.send_request(get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def list_friends():
    body, status = svc.list_friends(get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def list_requests():
    body, status = svc.list_requests(get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def accept(req_id):
    body, status = svc.accept(get_jwt_identity(), str(req_id))
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def decline(req_id):
    body, status = svc.decline(get_jwt_identity(), str(req_id))
    return jsonify(body), status