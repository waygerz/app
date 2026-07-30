"""Unified /c/B<code> deep link: resolve + act for a specific wager."""
import pytest

from app.services import service_wagers as svc
from app.models.wager import ACCEPTED, DECLINED, OPEN
from app.models.wager_invite_code import WagerInviteCode

U1 = "11111111-1111-1111-1111-111111111111"  # proposer
U2 = "22222222-2222-2222-2222-222222222222"  # acceptor
U3 = "33333333-3333-3333-3333-333333333333"  # bystander
LG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


@pytest.fixture(autouse=True)
def _stub_enrich(monkeypatch):
    # _enrich() (used by resolve preview) resolves names from auth over HTTP.
    monkeypatch.setattr(
        svc, "resolve_users_full",
        lambda ids: {str(i): {"display_name": f"User {str(i)[:4]}", "avatar_key": None} for i in ids},
    )


def _code_for(w):
    return WagerInviteCode.query.filter_by(wager_id=w.id).first().code


def test_propose_mints_bet_code(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    code = _code_for(w)
    assert code and code.startswith("B")


def test_resolve_acceptor_can_act(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    body, status = svc.resolve_code(U2, _code_for(w))
    assert status == 200
    assert body["type"] == "bet"
    assert body["target_id"] == w.id
    assert body["state"] == "ok"
    assert body["single_use"] is True
    assert body["viewer"]["relationship"] == "acceptor"
    assert body["actions"] == ["accept", "decline"]
    assert body["preview"]["wager"]["id"] == w.id
    assert body["preview"]["wager"]["amount_cents"] == 5000


def test_resolve_proposer_and_bystander_have_no_actions(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    code = _code_for(w)
    prop, _ = svc.resolve_code(U1, code)
    assert prop["viewer"]["relationship"] == "proposer" and prop["actions"] == []
    other, _ = svc.resolve_code(U3, code)
    assert other["viewer"]["relationship"] == "other" and other["actions"] == []


def test_resolve_unauthenticated_previews_without_actions(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    body, status = svc.resolve_code(None, _code_for(w))
    assert status == 200
    assert body["viewer"]["authenticated"] is False
    assert body["actions"] == []
    assert body["preview"]["wager"]["id"] == w.id


def test_resolve_invalid_code(app, calls):
    body, status = svc.resolve_code(U2, "BZZZZZZ")
    assert status == 404
    assert body["state"] == "invalid"


def test_act_accept_stakes_acceptor(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    body, status = svc.act_on_code(U2, _code_for(w), {"action": "accept"})
    assert status == 200
    assert body == {"type": "bet", "target_id": w.id}
    assert w.status == ACCEPTED
    assert ("hold", U2, 5000) in calls


def test_act_decline_refunds_proposer(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    body, status = svc.act_on_code(U2, _code_for(w), {"action": "decline"})
    assert status == 200
    assert w.status == DECLINED
    assert ("refund", U1, 5000) in calls


def test_act_rejected_for_non_acceptor(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    body, status = svc.act_on_code(U3, _code_for(w), {"action": "accept"})
    assert status == 400  # accept() raises "isn't addressed to you"
    assert w.status == OPEN


def test_consumed_after_accept(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    code = _code_for(w)
    svc.act_on_code(U2, code, {"action": "accept"})
    body, _ = svc.resolve_code(U2, code)
    assert body["state"] == "consumed"
    assert body["actions"] == []


def test_act_unsupported_action(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    body, status = svc.act_on_code(U2, _code_for(w), {"action": "cancel"})
    assert status == 400
