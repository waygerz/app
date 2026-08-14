from flask import jsonify, request

from app.services import service_internal as svc


def profiles():
    body, status = svc.resolve_profiles(request.get_json(silent=True) or {})
    return jsonify(body), status


def upsert_profile():
    body, status = svc.upsert_profile(request.get_json(silent=True) or {})
    return jsonify(body), status
