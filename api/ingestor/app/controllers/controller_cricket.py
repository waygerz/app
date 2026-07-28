from flask import jsonify

from app.services import service_cricket as service


def list_matches():
    body, status = service.list_matches()
    return jsonify(body), status


def get_match(external_id):
    body, status = service.get_match(external_id)
    return jsonify(body), status
