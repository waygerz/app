from flask import jsonify

from app.services import service_mma as service


def list_cards():
    body, status = service.list_cards()
    return jsonify(body), status


def get_card(external_id):
    body, status = service.get_card(external_id)
    return jsonify(body), status
