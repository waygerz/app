from flask import jsonify, request

from app.services import service_logout as svc


def logout():
    result = svc.logout_current(request)
    if hasattr(result, "status_code"):
        return result
    body, status = result
    return jsonify(body), status