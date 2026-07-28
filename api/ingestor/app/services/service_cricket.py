"""Cricket — a TEAM sport (home/away) via the shared ESPN ingester (Redis-only).
RealTimeSportsAPI carries no cricket; ESPN does, under numeric league IDs.
"""
from flask import current_app, request

from app.services import service_espn as espn


def list_matches():
    status = request.args.get("status")
    leagues = espn.resolve_leagues(request.args.get("league"), current_app.config["CRICKET_LEAGUES"])
    return {"matches": espn.team_list("cricket", leagues, status)}, 200


def get_match(external_id):
    board = espn.team_board("cricket", current_app.config["CRICKET_LEAGUES"], external_id)
    if board is None:
        return {"error": "match not found"}, 404
    return {"match": board["summary"], "sides": board.get("sides", [])}, 200
