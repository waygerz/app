from flask import Blueprint

from app.controllers import controller_internal as ctrl
from app.utils.guards import internal_only

wallet_internal_bp = Blueprint("internal", __name__)


@wallet_internal_bp.post("/balances")
@internal_only
def internal_balances():
    return ctrl.internal_balances()


@wallet_internal_bp.post("/account-balances")
@internal_only
def internal_account_balances():
    return ctrl.internal_account_balances()


@wallet_internal_bp.post("/grant")
@internal_only
def internal_grant():
    return ctrl.internal_grant()


@wallet_internal_bp.post("/hold")
@internal_only
def internal_hold():
    return ctrl.internal_hold()


@wallet_internal_bp.post("/payout")
@internal_only
def internal_payout():
    return ctrl.internal_payout()


@wallet_internal_bp.post("/refund")
@internal_only
def internal_refund():
    return ctrl.internal_refund()