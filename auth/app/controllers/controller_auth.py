from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.services import service_auth as svc


def _dispatch(result):
    if hasattr(result, "status_code"):
        return result
    body, status = result
    return jsonify(body), status


def otp_start():
    return _dispatch(svc.otp_start(request.get_json(silent=True) or {}))


def otp_verify():
    return _dispatch(svc.otp_verify(request.get_json(silent=True) or {}))


def otp_complete():
    return _dispatch(svc.otp_complete(request.get_json(silent=True) or {}))


@jwt_required(locations=["cookies", "headers"])
def me():
    body, status = svc.me(get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def set_avatar():
    body, status = svc.set_avatar(get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def update_me():
    body, status = svc.update_profile(get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status
