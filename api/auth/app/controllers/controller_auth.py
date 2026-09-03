from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.services import service_auth as svc
from app.services import service_delete_account


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
def delete_account():
    # Identity comes from the token — a user can only delete themselves.
    return service_delete_account.delete_account(get_jwt_identity())
