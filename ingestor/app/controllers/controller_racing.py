from flask import jsonify

from app.services import service_racing as service


def list_races():
    body, status = service.list_races()
    return jsonify(body), status


def get_race(external_id):
    body, status = service.get_race(external_id)
    return jsonify(body), status
