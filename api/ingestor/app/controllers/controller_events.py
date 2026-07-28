from flask import jsonify, request

from app.services import service_events as service
from app.services import service_schedule


def list_events():
    body, status = service.list_events()
    return jsonify(body), status


def schedule_weeks(sport, league):
    body, status = service_schedule.weeks(sport, league, request.args.get("season"))
    return jsonify(body), status


def schedule_weeks_by_catalog(sport_league_id):
    body, status = service_schedule.weeks_for_catalog(sport_league_id, request.args.get("season"))
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