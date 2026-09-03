from flask import jsonify, request

from app.services import service_internal as internal_svc
from app.services import service_messaging as svc


def post_message():
    body, status = svc.post_direct_message(request.get_json(silent=True) or {})
    return jsonify(body), status


def purge_user():
    body, status = internal_svc.purge_user(request.get_json(silent=True) or {})
    return jsonify(body), status
