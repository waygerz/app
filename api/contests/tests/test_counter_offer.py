"""Counter-offer money-conservation tests (see .docs/pending/COUNTER_OFFER_PLAN.md).

These exercise the full negotiation flow against a FakeWallet that mirrors the real
ledger semantics: every op is idempotent per (user, ref, type); hold/refund/payout
are distinct types that never net each other; ``holds`` returns net-outstanding
holds (a hold with no matching refund at the same (user, ref)) with an age. The
load-bearing assertion is money CONSERVATION — once a wager fully resolves, the net
across every user is zero and no stake is stranded at the wrong ref.

Requires a running Postgres (the *_test schema) — the flow uses SELECT ... FOR
UPDATE and JSONB. Run in the stack:
    docker compose exec -e DB_SCHEMA=contests_test contests \
        python -m pytest tests/test_counter_offer.py -q
"""
from datetime import datetime, timedelta

import pytest

from app.services import service_wagers as svc
from app.models.wager import (
    ACCEPTED, CANCELLED, DECLINED, MONEYLINE, OPEN, REFUNDED, SETTLED, SPREAD, TOTAL,
)

U1 = "11111111-1111-1111-1111-111111111111"  # proposer
U2 = "22222222-2222-2222-2222-222222222222"  # acceptor
U3 = "33333333-3333-3333-3333-333333333333"  # a third party
LG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


class FakeWallet:
    """A ledger mirroring the real wallet's idempotency + net-outstanding rules."""

    HOLD, REFUND, PAYOUT = "hold", "refund", "payout"

    def __init__(self):
        # (user, ref, type) -> {"amount": signed, "created_at": datetime(naive UTC)}
        self.ledger: dict = {}
        self.clock = datetime.utcnow()

    def _commit(self, user, ref, typ, signed, at=None):
        key = (str(user), ref, typ)
        if key in self.ledger:
            return  # idempotent — a repeat (user, ref, type) moves no money
        self.ledger[key] = {"amount": signed, "created_at": at or self.clock}

    # svc.hold/refund/payout signature is (account, user, amount, ref); $0 no-ops.
    def hold(self, account, user, amount, ref):
        if not amount or int(amount) <= 0:
            return
        self._commit(user, ref, self.HOLD, -abs(int(amount)))

    def refund(self, account, user, amount, ref):
        if not amount or int(amount) <= 0:
            return
        self._commit(user, ref, self.REFUND, abs(int(amount)))

    def payout(self, account, user, amount, ref):
        if not amount or int(amount) <= 0:
            return
        self._commit(user, ref, self.PAYOUT, abs(int(amount)))

    def holds(self, account, ref_prefix):
        refunded = {(u, r) for (u, r, t) in self.ledger if t == self.REFUND}
        out = []
        for (u, r, t), row in self.ledger.items():
            if t != self.HOLD or not r.startswith(ref_prefix) or (u, r) in refunded:
                continue
            out.append({
                "user_id": u,
                "ref": r,
                "amount_cents": abs(row["amount"]),
                "created_at": row["created_at"].isoformat() + "Z",
            })
        return out

    # test helpers ---------------------------------------------------------
    def inject_hold(self, user, ref, amount, age_seconds=0):
        """Simulate a stranded hold at a chosen age (for reconciler tests)."""
        self._commit(user, ref, self.HOLD, -abs(int(amount)),
                     at=datetime.utcnow() - timedelta(seconds=age_seconds))

    def net(self, user):
        return sum(row["amount"] for (u, r, t), row in self.ledger.items() if u == str(user))

    def total_net(self):
        return sum(row["amount"] for row in self.ledger.values())

    def outstanding(self, wager_id):
        return self.holds(None, f"wager:{wager_id}")


def _ctx(lid, minw=None, maxw=None):
    return {
        "league_id": lid, "league_type": "head_to_head",
        "commissioner_id": "00000000-0000-0000-0000-000000000000",
        "status": "active", "account": f"league:{lid}",
        "period_id": "11111111-1111-1111-1111-111111111111",
        "period_status": "open", "min_wager_cents": minw, "max_wager_cents": maxw,
        "starting_balance_cents": 1000000, "rules": {}, "sport_league_ids": [],
    }


@pytest.fixture()
def wallet(monkeypatch):
    w = FakeWallet()
    monkeypatch.setattr(svc, "hold", w.hold)
    monkeypatch.setattr(svc, "refund", w.refund)
    monkeypatch.setattr(svc, "payout", w.payout)
    monkeypatch.setattr(svc, "wallet_holds", w.holds)
    monkeypatch.setattr(svc, "are_comembers", lambda lid, a, b: True)
    monkeypatch.setattr(svc, "league_context", lambda lid: _ctx(lid))
    monkeypatch.setattr(svc, "get_event", lambda eid: {
        "name": "Away at Home", "league": "nba", "home_team": "Home",
        "away_team": "Away", "start_time": None, "status": "scheduled",
        "winner_side": None,
    })
    monkeypatch.setattr(svc, "post_league_activity", lambda lid, p: None)
    monkeypatch.setattr(svc, "resolve_users", lambda ids: {str(i): "User" for i in ids})
    monkeypatch.setattr(svc, "resolve_users_full",
                        lambda ids: {str(i): {"display_name": "User", "avatar_key": None} for i in ids})
    monkeypatch.setattr(svc, "_notify", lambda *a, **k: None)
    return w


# ---- basic counter mechanics ---------------------------------------------
def test_counter_supersedes_holder_and_flips_turn(app, wallet):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    assert w.held_id == U1 and w.pending_id == U2 and w.stake_round == 0
    svc.counter(w, U2, 3000)
    assert w.status == OPEN
    assert w.held_id == U2 and w.pending_id == U1
    assert w.amount_cents == 3000 and w.stake_round == 1
    assert w.held_ref.startswith(f"wager:{w.id}:r1:")
    # U1's original stake released; only U2's new stake is held.
    assert wallet.net(U1) == 0 and wallet.net(U2) == -3000
    outstanding = wallet.outstanding(w.id)
    assert len(outstanding) == 1 and outstanding[0]["user_id"] == U2


def test_counter_appends_negotiation_log(app, wallet):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.counter(w, U2, 3000)
    svc.counter(w, U1, 4000)
    assert [r["amount_cents"] for r in w.negotiation] == [3000, 4000]
    assert w.held_id == U1 and w.pending_id == U2 and w.stake_round == 2


def test_counter_not_your_turn_or_own_offer(app, wallet):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    with pytest.raises(svc.WagerError):
        svc.counter(w, U1, 3000)  # U1 holds — can't counter own offer
    with pytest.raises(svc.WagerError):
        svc.counter(w, U3, 3000)  # not the pending party


# ---- money conservation across every terminal path -----------------------
def test_counter_then_accept_then_settle_conserves(app, wallet, monkeypatch):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.counter(w, U2, 3000)          # U2 now holds, U1's turn
    svc.accept(w, U1)                 # U1 approves the $30 terms
    assert w.status == ACCEPTED and w.pending_id is None and w.accept_ref
    # Both stakes now held at their real refs (U2@r1, U1@accept).
    assert wallet.net(U1) == -3000 and wallet.net(U2) == -3000
    # Final score: proposer's side (home) wins.
    monkeypatch.setattr(svc, "get_event", lambda eid: {
        "status": "final", "home_score": 5, "away_score": 3,
        "winner_side": "home", "name": "x", "league": "nba",
        "home_team": "Home", "away_team": "Away", "start_time": None,
    })
    svc.settle_one(w)
    assert w.status == SETTLED and w.winner_user_id == U1
    assert wallet.total_net() == 0          # pot conserved
    assert wallet.net(U1) == 3000 and wallet.net(U2) == -3000


def test_counter_then_decline_conserves(app, wallet):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.counter(w, U2, 3000)          # U2 holds, U1's turn
    svc.decline(w, U1)                # U1 declines the counter
    assert w.status == DECLINED
    assert wallet.net(U1) == 0 and wallet.net(U2) == 0
    assert wallet.total_net() == 0 and wallet.outstanding(w.id) == []


def test_counter_then_withdraw_conserves(app, wallet):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.counter(w, U2, 3000)          # U2 holds (the offer), U1's turn
    svc.cancel(w, U2)                 # U2 withdraws their own counter
    assert w.status == CANCELLED
    assert wallet.net(U1) == 0 and wallet.net(U2) == 0
    assert wallet.total_net() == 0


def test_mutual_cancel_after_counter_conserves(app, wallet):
    """The eighth-audit CRITICAL: approve_cancel must refund at real held refs, or
    the proposer's base refund dedups the counter's [B] and shorts them a stake."""
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.counter(w, U2, 3000)          # U2 holds
    svc.accept(w, U1)                 # U1 approves -> both held (U2@r1, U1@accept)
    svc.request_cancel(w, U1)
    svc.approve_cancel(w, U2)
    assert w.status == CANCELLED
    # Neither party is shorted; both net to zero.
    assert wallet.net(U1) == 0 and wallet.net(U2) == 0
    assert wallet.total_net() == 0


def test_counter_then_void_push_conserves(app, wallet, monkeypatch):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.counter(w, U2, 3000)
    svc.accept(w, U1)
    monkeypatch.setattr(svc, "get_event", lambda eid: {"status": "cancelled"})
    svc.settle_one(w)                 # cancelled event -> _void_refund at real refs
    assert w.status == REFUNDED
    assert wallet.net(U1) == 0 and wallet.net(U2) == 0
    assert wallet.total_net() == 0


# ---- reconciler ----------------------------------------------------------
def test_reconciler_reclaims_aged_orphan(app, wallet):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.counter(w, U2, 3000)          # expected hold: U2 @ held_ref (r1)
    # A stranded hold from an aborted attempt, at a ref outside the expected set.
    orphan = f"wager:{w.id}:r2:deadbeef0000"
    wallet.inject_hold(U3, orphan, 4000, age_seconds=600)
    assert len(wallet.outstanding(w.id)) == 2
    svc._reconcile(w)                 # age-gated backstop
    remaining = wallet.outstanding(w.id)
    assert len(remaining) == 1 and remaining[0]["user_id"] == U2  # orphan reclaimed
    assert wallet.net(U3) == 0


def test_reconciler_age_gate_skips_young_orphan(app, wallet):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.counter(w, U2, 3000)
    orphan = f"wager:{w.id}:r2:deadbeef0000"
    wallet.inject_hold(U3, orphan, 4000, age_seconds=1)            # young
    svc._reconcile(w)                 # age-gated: must NOT touch a young hold
    assert len(wallet.outstanding(w.id)) == 2
    svc._reconcile(w, immediate=True)  # immediate: reclaims regardless of age
    assert len(wallet.outstanding(w.id)) == 1


def test_reconciler_never_refunds_expected_hold(app, wallet):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)   # U1 @ base is expected
    svc._reconcile(w, immediate=True)
    assert wallet.net(U1) == -5000    # untouched
    assert len(wallet.outstanding(w.id)) == 1


def test_settle_due_backstop_reclaims_round0_orphan(app, wallet):
    """The backstop must scan even a round-0 OPEN offer: a crashed first counter/
    accept can strand a hold while stake_round stays 0."""
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)   # OPEN, stake_round == 0
    wallet.inject_hold(U3, f"wager:{w.id}:accept:orphan000000", 5000, age_seconds=600)
    assert len(wallet.outstanding(w.id)) == 2
    svc._settle_due(refresh=False)                     # runs the periodic backstop
    remaining = wallet.outstanding(w.id)
    assert len(remaining) == 1 and remaining[0]["user_id"] == U1  # only the expected hold
    assert wallet.net(U3) == 0                         # orphan returned


# ---- line perspective ----------------------------------------------------
def test_counter_spread_negates_only_for_acceptor(app, wallet):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2, bet_type=SPREAD, line=-1.5)
    svc.counter(w, U2, 5000, line=2.5)     # acceptor's perspective -> stored -2.5
    assert w.line == -2.5
    svc.counter(w, U1, 5000, line=-3.5)    # proposer's perspective -> stored as-is
    assert w.line == -3.5


def test_counter_total_never_negated(app, wallet):
    w = svc.propose(U1, LG, "ev1", "over", 5000, U2, bet_type=TOTAL, line=8.5)
    svc.counter(w, U2, 5000, line=9.5)     # total is two-sided -> stored as-is
    assert w.line == 9.5
    svc.counter(w, U1, 5000, line=7.5)
    assert w.line == 7.5


# ---- /c link gating ------------------------------------------------------
def test_c_link_offers_action_to_whoever_turn(app, wallet):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.counter(w, U2, 3000)          # now it's the PROPOSER's turn
    from app.models.wager_invite_code import WagerInviteCode
    code = WagerInviteCode.query.filter_by(wager_id=w.id).first().code
    body, status = svc.resolve_code(U1, code)   # proposer's turn
    assert body["viewer"]["my_turn"] is True and body["actions"] == ["accept", "decline"]
    body2, _ = svc.resolve_code(U2, code)        # acceptor: waiting
    assert body2["viewer"]["my_turn"] is False and body2["actions"] == []


# ---- ref lengths fit the wallet column -----------------------------------
def test_refs_fit_transactions_ref_column(app, wallet):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    nonce = svc._nonce()
    assert len(nonce) == 12
    assert len(svc._ref_accept(w.id, nonce)) <= 64
    assert len(svc._ref_counter(w.id, 999999, nonce)) <= 64
