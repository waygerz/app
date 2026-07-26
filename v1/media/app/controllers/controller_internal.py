from flask import jsonify, request

from app.services import service_internal as svc


def verify():
    body, status = svc.verify_assets(request.get_json(silent=True) or {})
    return jsonify(body), status