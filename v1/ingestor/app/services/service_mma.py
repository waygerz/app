"""MMA (UFC, PFL) — a 1v1 sport served by the shared ESPN ingester. One event is a
card; each fight is a two-sided matchup. Redis-only cache-aside.
"""
from flask import current_app, request

from app.services import service_espn as espn


def list_cards():
    status = request.args.get("status")
    tours = espn.resolve_leagues(request.args.get("league"), current_app.config["MMA_TOURS"])
    return {"cards": espn.onevone_list("mma", tours, status)}, 200


def get_card(external_id):
    board = espn.onevone_card("mma", current_app.config["MMA_TOURS"], external_id)
    if board is None:
        return {"error": "card not found"}, 404
    return {"card": board["summary"], "fights": board.get("fights", [])}, 200
