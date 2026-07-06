"""Racing (F1, NASCAR, IndyCar) — a FIELD sport (drivers + finishing grid) served
by the shared ESPN ingester (Redis-only cache-aside). Winner = order 1 / winner flag.
"""
from flask import current_app, request

from app.services import service_espn as espn


def list_races():
    status = request.args.get("status")
    tours = espn.resolve_leagues(request.args.get("league"), current_app.config["RACING_TOURS"])
    return {"races": espn.field_list("racing", tours, status)}, 200


def get_race(external_id):
    board = espn.field_board("racing", current_app.config["RACING_TOURS"], external_id)
    if board is None:
        return {"error": "race not found"}, 404
    return {"race": board["summary"], "field": board.get("field", [])}, 200
