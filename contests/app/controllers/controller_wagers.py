from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.services import service_wagers as service


@jwt_required(locations=["cookies", "headers"])
def propose():
    body, status = service.propose_wagers(get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def my_wagers():
    body, status = service.my_wagers(get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def get_wager(wager_id):
    body, status = service.get_wager(wager_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def accept(wager_id):
    body, status = service.accept_wager(wager_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def decline(wager_id):
    body, status = service.decline_wager(wager_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def cancel(wager_id):
    body, status = service.cancel_wager(wager_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def request_cancel(wager_id):
    body, status = service.request_cancel_wager(wager_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def approve_cancel(wager_id):
    body, status = service.approve_cancel_wager(wager_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def reject_cancel(wager_id):
    body, status = service.reject_cancel_wager(wager_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def confirm(wager_id):
    body, status = service.confirm_wager(
        wager_id, get_jwt_identity(), request.get_json(silent=True) or {}
    )
    return jsonify(body), status


def settle_due():
    from app.services import service_internal as internal

    body, status = internal.tick()
    return jsonify(body), status