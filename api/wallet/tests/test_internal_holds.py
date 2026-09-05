"""The /internal/holds net-outstanding view the contests reconciler reads.

A hold is *outstanding* when its (account, user, ref) has a WAGER_HOLD row and no
matching WAGER_REFUND row; a payout (a different type) never nets a hold, so a
settled wager still reports its holds (the caller excludes SETTLED wagers, not this
endpoint). Requires a running Postgres (*_test schema).
"""
import uuid

from app.services import service_wallet as wallet
from app.services import service_internal as internal


def _setup(acct, users):
    for u in users:
        wallet.grant(acct, u, 1_000_000, "g")


def test_holds_lists_only_outstanding_under_prefix(app):
    acct = f"league:{uuid.uuid4()}"
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    _setup(acct, [a, b])
    wid = str(uuid.uuid4())
    # a's stake is refunded (superseded); b's stake stays held.
    wallet.hold(acct, a, 5000, f"wager:{wid}")
    wallet.refund(acct, a, 5000, f"wager:{wid}")
    wallet.hold(acct, b, 3000, f"wager:{wid}:r1:abc123abc123")
    # an unrelated wager's hold must not leak into this prefix
    wallet.hold(acct, a, 9999, f"wager:{uuid.uuid4()}")

    body, status = internal.internal_holds({"account": acct, "ref_prefix": f"wager:{wid}"})
    assert status == 200
    holds = body["holds"]
    assert len(holds) == 1
    assert holds[0]["user_id"] == b
    assert holds[0]["ref"] == f"wager:{wid}:r1:abc123abc123"
    assert holds[0]["amount_cents"] == 3000
    assert holds[0]["created_at"].endswith("Z")


def test_holds_payout_does_not_net_a_hold(app):
    acct = f"league:{uuid.uuid4()}"
    a = str(uuid.uuid4())
    _setup(acct, [a])
    wid = str(uuid.uuid4())
    wallet.hold(acct, a, 5000, f"wager:{wid}")
    wallet.payout(acct, a, 10000, f"wager:{wid}")  # different type — does not net
    body, _ = internal.internal_holds({"account": acct, "ref_prefix": f"wager:{wid}"})
    # The hold still reads as outstanding — which is why the reconciler must never
    # run on a SETTLED wager (its holds were consumed by the payout).
    assert [h["user_id"] for h in body["holds"]] == [a]


def test_holds_requires_account_and_prefix(app):
    body, status = internal.internal_holds({"account": "", "ref_prefix": ""})
    assert status == 200 and body["holds"] == []
