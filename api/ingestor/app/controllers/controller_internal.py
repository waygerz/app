from flask import jsonify

from app.services import service_internal as service
from app.services import service_quota
from app.services import service_schedule


def refresh_event(key):
    body, status = service.refresh_event(key)
    return jsonify(body), status


def schedule_tick():
    return jsonify(service_schedule.start_tick()), 202


def catalog_sync():
    body, status = service.catalog_sync()
    return jsonify(body), status


def quota():
    return jsonify(service_quota.report()), 200


def lookup_events():
    body, status = service.lookup_events()
    return jsonify(body), status
