from flask import Blueprint

from app.controllers import controller_sports as ctrl

ingestor_sports_bp = Blueprint("sports", __name__)


@ingestor_sports_bp.get("/sports")
def list_sports():
    return ctrl.list_sports()


@ingestor_sports_bp.get("/sports/<sport>/leagues")
def list_leagues(sport):
    return ctrl.list_leagues(sport)


@ingestor_sports_bp.get("/sports/<sport>/leagues/<league>/teams")
def list_teams(sport, league):
    return ctrl.list_teams(sport, league)