from flask import jsonify, request

from app.services import service_internal as svc


def lookup_phone():
    body, status = svc.lookup_phone(request.get_json(silent=True) or {})
    return jsonify(body), status


def users():
    body, status = svc.users(request.get_json(silent=True) or {})
    return jsonify(body), status