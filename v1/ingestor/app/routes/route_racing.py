from flask import Blueprint

from app.controllers import controller_racing as ctrl

ingestor_racing_bp = Blueprint("racing", __name__)


@ingestor_racing_bp.get("/racing/events")
def list_races():
    return ctrl.list_races()


@ingestor_racing_bp.get("/racing/events/<external_id>")
def get_race(external_id):
    return ctrl.get_race(external_id)
