from flask import Blueprint

from app.controllers import controller_golf as ctrl

ingestor_golf_bp = Blueprint("golf", __name__)


@ingestor_golf_bp.get("/golf/tournaments")
def list_tournaments():
    return ctrl.list_tournaments()


@ingestor_golf_bp.get("/golf/tournaments/<external_id>")
def get_tournament(external_id):
    return ctrl.get_tournament(external_id)
