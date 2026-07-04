from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.services import service_wallet as svc


@jwt_required(locations=["cookies", "headers"])
def my_wallet():
    body, status = svc.my_wallet(get_jwt_identity(), request.args.get("account"))
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def my_transactions():
    body, status = svc.my_transactions(
        get_jwt_identity(),
        request.args.get("account"),
        int(request.args.get("limit", 50)),
    )
    return jsonify(body), status