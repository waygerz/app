from flask import jsonify

from app.services import service_internal as service


def refresh_event(key):
    body, status = service.refresh_event(key)
    return jsonify(body), status


def catalog_sync():
    body, status = service.catalog_sync()
    return jsonify(body), status