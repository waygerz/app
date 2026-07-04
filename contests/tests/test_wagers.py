import pytest

from app.services import service_wagers as svc
from app.models.wager import ACCEPTED, CANCELLED, DECLINED, OPEN, REFUNDED, SETTLED

# User + league ids are UUIDs now.
U1 = "11111111-1111-1111-1111-111111111111"
U2 = "22222222-2222-2222-2222-222222222222"
U3 = "33333333-3333-3333-3333-333333333333"
U99 = "99999999-9999-9999-9999-999999999999"
LG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


def test_propose_holds_proposer_stake(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    assert w.status == OPEN and w.league_id == LG
    assert w.proposer_side == "home" and w.acceptor_side == "away"
    assert ("hold", U1, 5000) in calls


def test_accept_holds_acceptor_stake(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    assert w.status == ACCEPTED
    assert ("hold", U2, 5000) in calls


def test_accept_posts_league_feed(app, calls, monkeypatch):
    feed_posts = []
    monkeypatch.setattr(svc, "post_league_activity", lambda lid, p: feed_posts.append((lid, p)))
    monkeypatch.setattr(svc, "resolve_users", lambda ids: {U1: "Alice", U2: "Bob"})
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    assert len(feed_posts) == 1
    lid, payload = feed_posts[0]
    assert lid == LG
    assert payload["event_type"] == "wager_accepted"
    assert payload["dedup_key"] == f"wager_accepted:{w.id}"
    assert "Alice vs Bob" in payload["title"]
    assert payload["body"] == "Away at Home · 50.00 credits each"


def test_propose_requires_comembership(app, calls, monkeypatch):
    monkeypatch.setattr(svc, "are_comembers", lambda lid, a, b: False)
    with pytest.raises(svc.WagerError):
        svc.propose(U1, LG, "ev1", "home", 5000, U2)


def test_propose_rejects_when_period_closed(app, calls, monkeypatch):
    monkeypatch.setattr(svc, "league_context", lambda lid: {
        "league_type": "head_to_head", "status": "active", "account": f"league:{lid}",
        "period_status": "closed", "rules": {}, "sport_league_ids": [],
        "min_wager_cents": None, "max_wager_cents": None,
    })
    with pytest.raises(svc.WagerError):
        svc.propose(U1, LG, "ev1", "home", 5000, U2)


def test_propose_enforces_min_wager(app, calls, monkeypatch):
    monkeypatch.setattr(svc, "league_context", lambda lid: {
        "league_type": "head_to_head", "status": "active", "account": f"league:{lid}",
        "period_status": "open", "rules": {}, "sport_league_ids": [],
        "min_wager_cents": 10000, "max_wager_cents": None,
    })
    with pytest.raises(svc.WagerError):
        svc.propose(U1, LG, "ev1", "home", 5000, U2)


def test_cannot_bet_self(app, calls):
    with pytest.raises(svc.WagerError):
        svc.propose(U1, LG, "ev1", "home", 5000, U1)


def test_propose_rejects_non_scheduled_event(app, calls, monkeypatch):
    monkeypatch.setattr(
        svc, "get_event", lambda eid: {"status": "final", "name": "x",
                                            "league": "nba", "home_team": "H",
                                            "away_team": "A", "start_time": None}
    )
    with pytest.raises(svc.WagerError):
        svc.propose(U1, LG, "ev1", "home", 5000, U2)


def test_decline_refunds_proposer(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.decline(w, U2)
    assert w.status == DECLINED
    assert ("refund", U1, 5000) in calls


def test_cancel_refunds_proposer(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.cancel(w, U1)
    assert w.status == CANCELLED
    assert ("refund", U1, 5000) in calls


def test_settle_pays_winner_double(app, calls, monkeypatch):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)  # proposer takes home
    svc.accept(w, U2)
    monkeypatch.setattr(
        svc, "get_event", lambda eid: {"status": "final", "winner_side": "home"}
    )
    svc.settle_one(w)
    assert w.status == SETTLED and w.winner_user_id == U1
    assert ("payout", U1, 10000) in calls


def test_settle_draw_refunds_both(app, calls, monkeypatch):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    monkeypatch.setattr(
        svc, "get_event", lambda eid: {"status": "final", "winner_side": "draw"}
    )
    svc.settle_one(w)
    assert w.status == REFUNDED
    assert ("refund", U1, 5000) in calls and ("refund", U2, 5000) in calls


def test_settle_noop_when_event_not_final(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    svc.settle_one(w)  # default mocked event is still 'scheduled'
    assert w.status == ACCEPTED


def test_propose_many_creates_one_per_member(app, calls):
    results = svc.propose_many(U1, LG, "ev1", "home", 5000, [U2, U3])
    created = [r for r in results if "wager" in r]
    assert len(created) == 2
    assert calls.count(("hold", U1, 5000)) == 2


def test_cannot_accept_someone_elses_wager(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    with pytest.raises(svc.WagerError):
        svc.accept(w, U99)
