"""Internal wallet ops (service-to-service)."""
from app.extensions import db
from app.models.balance import Balance
from app.services.service_wallet import (
    InsufficientFunds,
    grant,
    hold,
    payout,
    refund,
)


def purge_user(data: dict) -> tuple[dict, int]:
    """Account deletion in the wallet service.

    Deletes the user's per-league `balances` rows (personal play-money holdings).
    The `transactions` ledger is an append-only financial record and is NEVER
    deleted — it stays for reconciliation, referencing the now-gone user id.
    Call this AFTER contests has refunded the user's live wagers so no stake is
    stranded. Idempotent.
    """
    try:
        uid = str(data["user_id"])
    except (KeyError, ValueError, TypeError):
        return {"error": "user_id is required"}, 400
    balances = Balance.query.filter(Balance.user_id == uid).delete(synchronize_session=False)
    db.session.commit()
    return {"purged": {"balances": balances}}, 200


def _internal_op(data: dict, op) -> tuple[dict, int]:
    try:
        account = str(data["account"])
        user_id = str(data["user_id"])
        amount_cents = int(data["amount_cents"])
    except (KeyError, ValueError, TypeError):
        return {"error": "account, user_id and amount_cents are required"}, 400
    ref = data.get("ref")
    try:
        txn = op(account, user_id, amount_cents, ref)
    except InsufficientFunds:
        return {"error": "insufficient funds"}, 402
    return {"transaction": txn.to_dict()}, 200


def internal_balances(data: dict) -> tuple[dict, int]:
    user_id = str(data.get("user_id", ""))
    accounts = [str(a) for a in (data.get("accounts") or [])]
    if not user_id or not accounts:
        return {"balances": {}}, 200
    rows = Balance.query.filter(
        Balance.user_id == user_id, Balance.account.in_(accounts)
    ).all()
    return {"balances": {r.account: r.balance_cents for r in rows}}, 200


def internal_account_balances(data: dict) -> tuple[dict, int]:
    account = str(data.get("account", ""))
    if not account:
        return {"balances": {}}, 200
    rows = Balance.query.filter_by(account=account).all()
    return {"balances": {r.user_id: r.balance_cents for r in rows}}, 200


def internal_grant(data: dict) -> tuple[dict, int]:
    return _internal_op(data, grant)


def internal_hold(data: dict) -> tuple[dict, int]:
    return _internal_op(data, hold)


def internal_payout(data: dict) -> tuple[dict, int]:
    return _internal_op(data, payout)


def internal_refund(data: dict) -> tuple[dict, int]:
    return _internal_op(data, refund)