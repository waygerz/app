from flask import jsonify

from app.services import service_events as service


def list_events():
    body, status = service.list_events()
    return jsonify(body), status


def league_events(sport, league):
    body, status = service.league_events(sport, league)
    return jsonify(body), status


def event_odds(sport, league, event_id):
    body, status = service.event_odds(sport, league, event_id)
    return jsonify(body), status


def get_event(key):
    body, status = service.get_event(key)
    return jsonify(body), status


def sync():
    body, status = service.sync()
    return jsonify(body), status