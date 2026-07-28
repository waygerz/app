import uuid

import pytest

from app.extensions import db
from app.models.balance import Balance
from app.services import service_wallet as wallet


def _acct():
    return f"league:{uuid.uuid4()}"


def _balance(account, user_id):
    return db.session.get(Balance, {"account": account, "user_id": user_id}).balance_cents


def test_grant_funds_account_once(app):
    acct, uid = _acct(), str(uuid.uuid4())
    wallet.grant(acct, uid, 100000, "league_grant:L1")
    assert _balance(acct, uid) == 100000
    # re-running the same grant (account, user, ref, type) must NOT fund again
    wallet.grant(acct, uid, 100000, "league_grant:L1")
    assert _balance(acct, uid) == 100000


def test_new_account_starts_empty(app):
    acct, uid = _acct(), str(uuid.uuid4())
    wallet.ensure_account(acct, uid)
    assert _balance(acct, uid) == 0  # no signup bonus anymore


def test_hold_then_payout(app):
    acct, uid = _acct(), str(uuid.uuid4())
    wallet.grant(acct, uid, 100000, "g")
    wallet.hold(acct, uid, 5000, "wager:1")
    assert _balance(acct, uid) == 100000 - 5000
    wallet.payout(acct, uid, 10000, "wager:1")
    assert _balance(acct, uid) == 100000 - 5000 + 10000


def test_hold_then_refund_is_neutral(app):
    acct, uid = _acct(), str(uuid.uuid4())
    wallet.grant(acct, uid, 100000, "g")
    wallet.hold(acct, uid, 2500, "wager:2")
    wallet.refund(acct, uid, 2500, "wager:2")
    assert _balance(acct, uid) == 100000


def test_insufficient_funds_rejected(app):
    acct, uid = _acct(), str(uuid.uuid4())
    wallet.ensure_account(acct, uid)  # starts at 0
    with pytest.raises(wallet.InsufficientFunds):
        wallet.hold(acct, uid, 1, "too-much")
    assert _balance(acct, uid) == 0


def test_accounts_are_isolated(app):
    """The same user in two leagues has independent balances, and the same ref
    is independent across accounts."""
    a, b = _acct(), _acct()
    uid = str(uuid.uuid4())
    wallet.grant(a, uid, 100000, "g")
    wallet.grant(b, uid, 100000, "g")
    # A hold in league A with ref "wager:9" must not touch league B's balance,
    # and B can use the same ref independently.
    wallet.hold(a, uid, 7000, "wager:9")
    assert _balance(a, uid) == 93000
    assert _balance(b, uid) == 100000
    wallet.hold(b, uid, 1000, "wager:9")
    assert _balance(b, uid) == 99000


def test_ledger_balance_matches_transaction_sum(app):
    from app.models.transaction import Transaction

    acct, uid = _acct(), str(uuid.uuid4())
    wallet.grant(acct, uid, 100000, "g")
    wallet.hold(acct, uid, 3000, "w")
    wallet.payout(acct, uid, 6000, "w")
    total = sum(
        t.amount_cents
        for t in Transaction.query.filter_by(account=acct, user_id=uid).all()
    )
    assert total == _balance(acct, uid)
