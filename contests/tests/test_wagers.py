import pytest

from app.services import service_wagers as svc
from app.models.wager import (
    ACCEPTED, CANCELLED, COMPLETED, DECLINED, OPEN, REFUNDED, SETTLED,
)

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


def test_settle_marks_completed_on_final(app, calls, monkeypatch):
    # A final event no longer auto-pays — it moves to `completed`, awaiting the
    # winner's confirmation. No money moves at this step.
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: {"status": "final"})
    svc.settle_one(w)
    assert w.status == COMPLETED and w.completed_at is not None
    assert w.winner_user_id is None
    assert not any(op == "payout" for op, *_ in calls)


def test_settle_refunds_on_cancelled(app, calls, monkeypatch):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: {"status": "cancelled"})
    svc.settle_one(w)
    assert w.status == REFUNDED
    assert ("refund", U1, 5000) in calls and ("refund", U2, 5000) in calls


def test_settle_noop_when_event_not_final(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    svc.settle_one(w)  # default mocked event is 'scheduled', start_time None
    assert w.status == ACCEPTED


def test_confirm_won_is_rejected(app, calls, monkeypatch):
    # Nobody can claim their own win — only the losing side settles, so a 'won'
    # confirmation is refused and no money moves.
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: {"status": "final"})
    svc.settle_one(w)  # -> COMPLETED
    with pytest.raises(svc.WagerError):
        svc.confirm(w, U1, "won")
    assert w.status == COMPLETED
    assert not any(op == "payout" for op, _u, _a in calls)


def test_confirm_lost_pays_the_other_side(app, calls, monkeypatch):
    # The loser can concede — marking 'lost' pays the opponent.
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: {"status": "final"})
    svc.settle_one(w)
    svc.confirm(w, U1, "lost")
    assert w.status == SETTLED and w.winner_user_id == U2
    assert ("payout", U2, 10000) in calls


def test_confirm_draw_refunds_both(app, calls, monkeypatch):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: {"status": "final"})
    svc.settle_one(w)
    svc.confirm(w, U2, "draw")
    assert w.status == REFUNDED and w.confirmed_by_id == U2
    assert ("refund", U1, 5000) in calls and ("refund", U2, 5000) in calls


def test_confirm_rejects_unrelated_user(app, calls, monkeypatch):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: {"status": "final"})
    svc.settle_one(w)
    with pytest.raises(svc.WagerError):
        svc.confirm(w, U99, "lost")


def test_confirm_rejects_after_settled(app, calls, monkeypatch):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: {"status": "final"})
    svc.settle_one(w)
    svc.confirm(w, U1, "lost")  # settles: U2 takes the pot
    with pytest.raises(svc.WagerError):
        svc.confirm(w, U2, "lost")


def test_confirm_blocked_before_known_kickoff(app, calls):
    # A known, still-future start time blocks settling straight from ACCEPTED.
    from app.extensions import db

    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    w.start_time = "2999-01-01T00:00:00Z"
    db.session.commit()
    with pytest.raises(svc.WagerError):
        svc.confirm(w, U1, "lost")
    assert w.status == ACCEPTED


def test_confirm_from_accepted_after_kickoff(app, calls):
    # Known past start time: peers can settle from ACCEPTED without waiting for
    # the scheduled sweep.
    from app.extensions import db

    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    w.start_time = "2020-01-01T00:00:00Z"
    db.session.commit()
    svc.confirm(w, U1, "lost")
    assert w.status == SETTLED and w.winner_user_id == U2
    assert ("payout", U2, 10000) in calls


def test_confirm_allowed_when_start_unknown(app, calls):
    # Unknown start time (mocked event has start_time None): settlement is allowed
    # rather than stranding the wager forever — loser-concedes keeps it safe.
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    svc.confirm(w, U1, "lost")
    assert w.status == SETTLED and w.winner_user_id == U2
    assert ("payout", U2, 10000) in calls


def test_propose_many_creates_one_per_member(app, calls):
    results = svc.propose_many(U1, LG, "ev1", "home", 5000, [U2, U3])
    created = [r for r in results if "wager" in r]
    assert len(created) == 2
    assert calls.count(("hold", U1, 5000)) == 2


def test_cannot_accept_someone_elses_wager(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    with pytest.raises(svc.WagerError):
        svc.accept(w, U99)


# ---- mutual cancellation of an accepted wager -------------------------------

def _accepted(monkeypatch, start_time=None):
    """An accepted wager, optionally with a start time on the model."""
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    if start_time is not None:
        w.start_time = start_time
    return w


def test_request_cancel_records_requester_and_moves_no_money(app, calls, monkeypatch):
    w = _accepted(monkeypatch)
    before = list(calls)
    svc.request_cancel(w, U1)
    assert w.cancel_requested_by == U1 and w.cancel_requested_at is not None
    assert w.status == ACCEPTED       # still live until the other side agrees
    assert calls == before            # nothing refunded yet


def test_requester_cannot_approve_their_own_request(app, calls, monkeypatch):
    w = _accepted(monkeypatch)
    svc.request_cancel(w, U1)
    with pytest.raises(svc.WagerError):
        svc.approve_cancel(w, U1)
    assert w.status == ACCEPTED


def test_approve_cancel_refunds_both_sides(app, calls, monkeypatch):
    w = _accepted(monkeypatch)
    svc.request_cancel(w, U1)
    svc.approve_cancel(w, U2)
    assert w.status == CANCELLED
    assert w.cancel_requested_by is None
    assert ("refund", U1, 5000) in calls and ("refund", U2, 5000) in calls


def test_reject_cancel_leaves_the_wager_standing(app, calls, monkeypatch):
    w = _accepted(monkeypatch)
    svc.request_cancel(w, U1)
    svc.reject_cancel(w, U2)
    assert w.status == ACCEPTED
    assert w.cancel_requested_by is None
    assert not any(op == "refund" for op, *_ in calls)


def test_double_request_is_rejected(app, calls, monkeypatch):
    w = _accepted(monkeypatch)
    svc.request_cancel(w, U1)
    with pytest.raises(svc.WagerError):
        svc.request_cancel(w, U1)
    with pytest.raises(svc.WagerError):
        svc.request_cancel(w, U2)   # other side must approve/reject instead


def test_approve_without_a_request_is_rejected(app, calls, monkeypatch):
    w = _accepted(monkeypatch)
    with pytest.raises(svc.WagerError):
        svc.approve_cancel(w, U2)


def test_request_cancel_needs_an_accepted_wager(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)   # still open
    with pytest.raises(svc.WagerError):
        svc.request_cancel(w, U1)


# ---- the pre-game lock ------------------------------------------------------

def _iso(dt):
    return dt.replace(microsecond=0).isoformat() + "Z"


def test_cancel_locks_inside_the_pre_game_window(app, calls, monkeypatch):
    from datetime import datetime, timedelta
    soon = datetime.utcnow() + timedelta(minutes=5)      # inside the 10-min lock
    w = _accepted(monkeypatch, start_time=_iso(soon))
    with pytest.raises(svc.WagerError):
        svc.request_cancel(w, U1)


def test_cancel_allowed_outside_the_pre_game_window(app, calls, monkeypatch):
    from datetime import datetime, timedelta
    later = datetime.utcnow() + timedelta(minutes=30)
    w = _accepted(monkeypatch, start_time=_iso(later))
    svc.request_cancel(w, U1)
    assert w.cancel_requested_by == U1


def test_approve_also_blocked_once_locked(app, calls, monkeypatch):
    from datetime import datetime, timedelta
    later = datetime.utcnow() + timedelta(minutes=30)
    w = _accepted(monkeypatch, start_time=_iso(later))
    svc.request_cancel(w, U1)
    # kickoff creeps up before the other side responds
    w.start_time = _iso(datetime.utcnow() + timedelta(minutes=2))
    with pytest.raises(svc.WagerError):
        svc.approve_cancel(w, U2)
    assert w.status == ACCEPTED


def test_open_wager_cancel_blocked_once_locked(app, calls):
    from datetime import datetime, timedelta
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    w.start_time = _iso(datetime.utcnow() + timedelta(minutes=3))
    with pytest.raises(svc.WagerError):
        svc.cancel(w, U1)


def test_unknown_start_time_does_not_lock(app, calls, monkeypatch):
    w = _accepted(monkeypatch, start_time=None)
    w.start_time = None
    svc.request_cancel(w, U1)       # can't prove we're inside the window
    assert w.cancel_requested_by == U1
