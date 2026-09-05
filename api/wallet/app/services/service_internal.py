"""Internal wallet ops (service-to-service)."""
from app.extensions import db
from app.models.balance import Balance
from app.models.transaction import WAGER_HOLD, WAGER_REFUND, Transaction
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


def internal_holds(data: dict) -> tuple[dict, int]:
    """Net-outstanding WAGER_HOLDs under a ref prefix, by (user_id, ref), with age.

    A hold is *outstanding* when its (account, user_id, ref) carries a WAGER_HOLD
    row and **no** matching WAGER_REFUND row (a payout is a different type and
    never nets a hold — settled wagers are excluded by the caller, not here).
    Returns each outstanding hold's user_id, ref, amount_cents (unsigned), and
    created_at. The contests reconciler uses `created_at` to age-gate — a hold
    younger than RECONCILE_MIN_AGE may be an in-flight counter and is left alone.
    """
    account = str(data.get("account", ""))
    prefix = str(data.get("ref_prefix", ""))
    if not account or not prefix:
        return {"holds": []}, 200
    # A wager ref is "wager:{uuid}[...]" — the prefix carries no LIKE
    # metacharacters, so a bare prefix match is safe and exact to one wager.
    rows = Transaction.query.filter(
        Transaction.account == account,
        Transaction.type.in_([WAGER_HOLD, WAGER_REFUND]),
        Transaction.ref.like(prefix + "%"),
    ).all()
    holds: dict[tuple[str, str], Transaction] = {}
    refunded: set[tuple[str, str]] = set()
    for r in rows:
        key = (r.user_id, r.ref)
        if r.type == WAGER_HOLD:
            holds[key] = r
        else:
            refunded.add(key)
    out = [
        {
            "user_id": user_id,
            "ref": ref,
            "amount_cents": abs(txn.amount_cents),
            "created_at": txn.created_at.isoformat() + "Z",
        }
        for (user_id, ref), txn in holds.items()
        if (user_id, ref) not in refunded
    ]
    return {"holds": out}, 200


def internal_grant(data: dict) -> tuple[dict, int]:
    return _internal_op(data, grant)


def internal_hold(data: dict) -> tuple[dict, int]:
    return _internal_op(data, hold)


def internal_payout(data: dict) -> tuple[dict, int]:
    return _internal_op(data, payout)


def internal_refund(data: dict) -> tuple[dict, int]:
    return _internal_op(data, refund)