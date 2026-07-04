"""Wallet domain: balances, transactions, and ledger mutations.

Every change locks the (account, user) balance row (SELECT ... FOR UPDATE),
writes a Transaction row, and updates the balance — all in one DB transaction.
All money is league-scoped: every op carries an ``account`` = ``league:{uuid}``.
Money enters an account only via ``grant`` (a commissioner funding a member);
there is no signup bonus and no global account.
"""
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.balance import Balance
from app.models.transaction import (
    LEAGUE_GRANT,
    WAGER_HOLD,
    WAGER_PAYOUT,
    WAGER_REFUND,
    Transaction,
)


class InsufficientFunds(Exception):
    pass


def _locked_balance(account: str, user_id: str) -> Balance:
    return db.session.execute(
        select(Balance)
        .where(Balance.account == account, Balance.user_id == user_id)
        .with_for_update()
    ).scalar_one()


def ensure_account(account: str, user_id: str) -> Balance:
    """Return the (account, user) balance row, creating it at zero if absent.

    No money is granted here — accounts start empty and are funded by ``grant``.
    """
    bal = db.session.get(Balance, {"account": account, "user_id": user_id})
    if bal is not None:
        return bal
    try:
        db.session.add(Balance(account=account, user_id=user_id, balance_cents=0))
        db.session.commit()
    except IntegrityError:
        # Concurrent first-access created it; fall back to the existing row.
        db.session.rollback()
    return db.session.get(Balance, {"account": account, "user_id": user_id})


def _apply(account: str, user_id: str, txn_type: str, amount_cents: int, ref=None) -> Transaction:
    """Apply a signed amount to the (locked) balance + a ledger row.

    Does not commit — callers control the transaction boundary.
    """
    bal = _locked_balance(account, user_id)
    new_balance = bal.balance_cents + amount_cents
    if new_balance < 0:
        raise InsufficientFunds(
            f"balance {bal.balance_cents} cannot absorb {amount_cents}"
        )
    bal.balance_cents = new_balance
    txn = Transaction(
        account=account,
        user_id=user_id,
        ref=ref,
        type=txn_type,
        amount_cents=amount_cents,
        balance_after_cents=new_balance,
    )
    db.session.add(txn)
    db.session.flush()
    return txn


def _existing(account, user_id, txn_type, ref):
    if ref is None:
        return None
    return Transaction.query.filter_by(
        account=account, user_id=user_id, ref=ref, type=txn_type
    ).first()


def _committed(account, user_id, txn_type, amount_cents, ref):
    """Apply a money move idempotently: re-running the same
    (account, user, ref, type) returns the prior transaction without moving
    money again."""
    ensure_account(account, user_id)
    prior = _existing(account, user_id, txn_type, ref)
    if prior is not None:
        return prior
    try:
        txn = _apply(account, user_id, txn_type, amount_cents, ref)
        db.session.commit()
    except IntegrityError:
        # Lost a race on the unique (account, user, ref, type) constraint.
        db.session.rollback()
        prior = _existing(account, user_id, txn_type, ref)
        if prior is not None:
            return prior
        raise
    return txn


# Public ops (callers pass positive amounts).
def grant(account, user_id, amount_cents, ref=None):
    """Fund a member's league balance (commissioner grant on join)."""
    return _committed(account, user_id, LEAGUE_GRANT, abs(amount_cents), ref)


def hold(account, user_id, amount_cents, ref=None):
    return _committed(account, user_id, WAGER_HOLD, -abs(amount_cents), ref)


def payout(account, user_id, amount_cents, ref=None):
    return _committed(account, user_id, WAGER_PAYOUT, abs(amount_cents), ref)


def refund(account, user_id, amount_cents, ref=None):
    return _committed(account, user_id, WAGER_REFUND, abs(amount_cents), ref)


def my_wallet(user_id: str, account: str | None) -> tuple[dict, int]:
    if not account:
        return {"error": "account is required (e.g. league:{id})"}, 400
    bal = ensure_account(account, user_id)
    return {"wallet": bal.to_dict()}, 200


def my_transactions(user_id: str, account: str | None, limit: int) -> tuple[dict, int]:
    if not account:
        return {"error": "account is required (e.g. league:{id})"}, 400
    ensure_account(account, user_id)
    txns = (
        Transaction.query.filter_by(account=account, user_id=user_id)
        .order_by(Transaction.created_at.desc())
        .limit(min(limit, 200))
        .all()
    )
    return {"transactions": [t.to_dict() for t in txns]}, 200