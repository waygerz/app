from flask import Blueprint

from app.controllers import controller_cricket as ctrl

ingestor_cricket_bp = Blueprint("cricket", __name__)


@ingestor_cricket_bp.get("/cricket/matches")
def list_matches():
    return ctrl.list_matches()


@ingestor_cricket_bp.get("/cricket/matches/<external_id>")
def get_match(external_id):
    return ctrl.get_match(external_id)
