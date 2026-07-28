from flask import jsonify, request

from app.services import service_internal as svc


def are_friends():
    body, status = svc.are_friends(request.get_json(silent=True) or {})
    return jsonify(body), status