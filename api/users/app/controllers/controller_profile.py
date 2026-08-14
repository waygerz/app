from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity

from app.services import service_profile as svc


def get_profile():
    body, status = svc.get_profile(get_jwt_identity())
    return jsonify(body), status


def update_profile():
    body, status = svc.update_display_name(get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status


def set_avatar():
    body, status = svc.set_avatar(get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status
