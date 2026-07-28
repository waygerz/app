from flask import Blueprint

from app.controllers import controller_mma as ctrl

ingestor_mma_bp = Blueprint("mma", __name__)


@ingestor_mma_bp.get("/mma/cards")
def list_cards():
    return ctrl.list_cards()


@ingestor_mma_bp.get("/mma/cards/<external_id>")
def get_card(external_id):
    return ctrl.get_card(external_id)
