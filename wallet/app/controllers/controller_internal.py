from flask import jsonify, request

from app.services import service_internal as svc


def internal_balances():
    body, status = svc.internal_balances(request.get_json(silent=True) or {})
    return jsonify(body), status


def internal_account_balances():
    body, status = svc.internal_account_balances(request.get_json(silent=True) or {})
    return jsonify(body), status


def internal_grant():
    body, status = svc.internal_grant(request.get_json(silent=True) or {})
    return jsonify(body), status


def internal_hold():
    body, status = svc.internal_hold(request.get_json(silent=True) or {})
    return jsonify(body), status


def internal_payout():
    body, status = svc.internal_payout(request.get_json(silent=True) or {})
    return jsonify(body), status


def internal_refund():
    body, status = svc.internal_refund(request.get_json(silent=True) or {})
    return jsonify(body), status