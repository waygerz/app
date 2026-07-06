"""Golf — a FIELD sport served by the shared ESPN ingester (Redis-only cache-aside).
All the fetch/cache/parse logic lives in service_espn; this just names the shape.
"""
from flask import current_app, request

from app.services import service_espn as espn


def list_tournaments():
    status = request.args.get("status")
    tours = espn.resolve_leagues(request.args.get("league"), current_app.config["GOLF_TOURS"])
    return {"tournaments": espn.field_list("golf", tours, status)}, 200


def get_tournament(external_id):
    board = espn.field_board("golf", current_app.config["GOLF_TOURS"], external_id)
    if board is None:
        return {"error": "tournament not found"}, 404
    return {"tournament": board["summary"], "field": board.get("field", [])}, 200
