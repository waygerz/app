from flask import jsonify

from app.services import service_internal as service


def league_record():
    body, status = service.league_record()
    return jsonify(body), status


def tick():
    body, status = service.tick()
    return jsonify(body), status