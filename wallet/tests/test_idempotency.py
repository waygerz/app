import uuid

from app.extensions import db
from app.models.balance import Balance
from app.models.transaction import Transaction
from app.services import service_wallet as wallet


def _acct():
    return f"league:{uuid.uuid4()}"


def _balance(account, user_id):
    return db.session.get(Balance, {"account": account, "user_id": user_id}).balance_cents


def test_payout_is_idempotent_by_ref(app):
    acct, uid = _acct(), str(uuid.uuid4())
    wallet.ensure_account(acct, uid)
    before = _balance(acct, uid)
    wallet.payout(acct, uid, 10000, "wager:42")
    after_first = _balance(acct, uid)
    # re-running the same (account, user, ref, type) must NOT pay again
    wallet.payout(acct, uid, 10000, "wager:42")
    assert _balance(acct, uid) == after_first == before + 10000
    # and only one ledger row exists for it
    rows = Transaction.query.filter_by(
        account=acct, user_id=uid, ref="wager:42", type="wager_payout"
    ).all()
    assert len(rows) == 1


def test_hold_is_idempotent_by_ref(app):
    acct, uid = _acct(), str(uuid.uuid4())
    wallet.grant(acct, uid, 100000, "g")
    before = _balance(acct, uid)
    wallet.hold(acct, uid, 2500, "wager:7")
    wallet.hold(acct, uid, 2500, "wager:7")  # repeat
    assert _balance(acct, uid) == before - 2500
