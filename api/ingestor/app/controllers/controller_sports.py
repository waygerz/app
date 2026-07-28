from flask import jsonify

from app.services import service_sports as service


def list_sports():
    body, status = service.list_sports()
    return jsonify(body), status


def list_leagues(sport):
    body, status = service.list_leagues(sport)
    return jsonify(body), status


def list_teams(sport, league):
    body, status = service.list_teams(sport, league)
    return jsonify(body), status