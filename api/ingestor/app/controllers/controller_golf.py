from flask import jsonify

from app.services import service_golf as service


def list_tournaments():
    body, status = service.list_tournaments()
    return jsonify(body), status


def get_tournament(external_id):
    body, status = service.get_tournament(external_id)
    return jsonify(body), status
