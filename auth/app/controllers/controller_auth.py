from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.services import service_auth as svc


def _dispatch(result):
    if hasattr(result, "status_code"):
        return result
    body, status = result
    return jsonify(body), status


def signup_start():
    return _dispatch(svc.signup_start(request.get_json(silent=True) or {}))


def signup_verify():
    return _dispatch(svc.signup_verify(request.get_json(silent=True) or {}))


def login():
    return _dispatch(svc.login(request.get_json(silent=True) or {}))


@jwt_required(locations=["cookies", "headers"])
def me():
    body, status = svc.me(get_jwt_identity())
    return jsonify(body), status