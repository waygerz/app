from flask import jsonify

from app.services import service_internal as service
from app.services import service_schedule


def refresh_event(key):
    body, status = service.refresh_event(key)
    return jsonify(body), status


def schedule_tick():
    return jsonify(service_schedule.tick()), 200


def catalog_sync():
    body, status = service.catalog_sync()
    return jsonify(body), status