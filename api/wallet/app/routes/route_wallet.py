from flask import Blueprint

from app.controllers import controller_wallet as ctrl

wallet_bp = Blueprint("wallet", __name__)


@wallet_bp.get("/me")
def my_wallet():
    return ctrl.my_wallet()


@wallet_bp.get("/me/transactions")
def my_transactions():
    return ctrl.my_transactions()