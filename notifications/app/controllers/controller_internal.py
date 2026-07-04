from flask import jsonify, request

from app.services import service_internal as svc


def send():
    body, status = svc.send(request.get_json(silent=True) or {})
    return jsonify(body), status


def set_preferences():
    body, status = svc.set_preferences(request.get_json(silent=True) or {})
    return jsonify(body), status