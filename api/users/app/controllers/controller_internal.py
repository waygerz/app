from flask import jsonify, request

from app.services import service_internal as svc
from app.services import service_tick


def profiles():
    body, status = svc.resolve_profiles(request.get_json(silent=True) or {})
    return jsonify(body), status


def upsert_profile():
    body, status = svc.upsert_profile(request.get_json(silent=True) or {})
    return jsonify(body), status


def tick():
    body, status = service_tick.tick()
    return jsonify(body), status
