from flask import jsonify, request

from app.services import service_internal as svc


def purge_user():
    body, status = svc.purge_user(request.get_json(silent=True) or {})
    return jsonify(body), status
