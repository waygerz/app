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
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)  # Alice takes Home vs Bob
    svc.accept(w, U2)
    assert len(feed_posts) == 1
    lid, payload = feed_posts[0]
    assert lid == LG
    assert payload["event_type"] == "wager_accepted"
    # The proposer is the author (drives the avatar). Title is the short
    # matchup; the pick sentence is the wrapping body.
    assert payload["author_id"] == U1
    assert payload["title"] == "Away at Home"  # event_name (the matchup)
    assert payload["body"] == "Alice took Home for $50 against Bob"
    assert payload["upsert"] is True


def test_accept_aggregates_multiple_opponents(app, calls, monkeypatch):
    feed_posts = []
    monkeypatch.setattr(svc, "post_league_activity", lambda lid, p: feed_posts.append((lid, p)))
    monkeypatch.setattr(svc, "resolve_users",
                        lambda ids: {U1: "Anky", U2: "Johnny", U3: "Richard"})
    # Anky offers the same bet to two members; they accept in turn.
    results = svc.propose_many(U1, LG, "ev1", "home", 1000, [U2, U3])
    wagers = [r["wager"] for r in results]
    svc.accept(wagers[0], U2)
    svc.accept(wagers[1], U3)

    # Same group dedup_key both times (one upserted post, not two).
    assert len({p["dedup_key"] for _, p in feed_posts}) == 1
    assert all(p["upsert"] for _, p in feed_posts)
    # Final body lists both opponents with the "over" connector (order of the
    # two names isn't asserted — sibling wagers can share a created_at).
    final = feed_posts[-1][1]["body"]
    assert final.startswith("Anky took Home for $10 over ")
    assert "Johnny" in final and "Richard" in final


def test_opponent_phrase_shapes():
    assert svc._opponent_phrase(["A"]) == "A"
    assert svc._opponent_phrase(["A", "B"]) == "A and B"
    assert svc._opponent_phrase(["A", "B", "C"]) == "A, B and 1 other"
    assert svc._opponent_phrase(["A", "B", "C", "D"]) == "A, B and 2 others"


def test_format_stake_strips_whole_dollars():
    assert svc._format_stake(1000) == "$10"
    assert svc._format_stake(1050) == "$10.50"
    assert svc._format_stake(500) == "$5"


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


# ---- bet types: moneyline / spread / total ---------------------------------

def test_propose_defaults_to_moneyline(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    assert w.bet_type == "moneyline" and w.line is None
    assert w.proposer_side == "home" and w.acceptor_side == "away"


def test_spread_stores_type_and_line(app, calls):
    w = svc.propose(U1, LG, "ev1", "away", 5000, U2, bet_type="spread", line=-1.5)
    assert w.bet_type == "spread" and w.line == -1.5
    assert w.proposer_side == "away" and w.acceptor_side == "home"


def test_total_over_under_sides(app, calls):
    w = svc.propose(U1, LG, "ev1", "over", 5000, U2, bet_type="total", line=8.5)
    assert w.bet_type == "total" and w.line == 8.5
    assert w.proposer_side == "over" and w.acceptor_side == "under"


def test_spread_requires_a_line(app, calls):
    with pytest.raises(svc.WagerError):
        svc.propose(U1, LG, "ev1", "home", 5000, U2, bet_type="spread", line=None)


def test_total_requires_a_line(app, calls):
    with pytest.raises(svc.WagerError):
        svc.propose(U1, LG, "ev1", "over", 5000, U2, bet_type="total", line=None)


def test_total_rejects_home_away_side(app, calls):
    with pytest.raises(svc.WagerError):
        svc.propose(U1, LG, "ev1", "home", 5000, U2, bet_type="total", line=8.5)


def test_moneyline_rejects_over_under_side(app, calls):
    with pytest.raises(svc.WagerError):
        svc.propose(U1, LG, "ev1", "over", 5000, U2)


def test_invalid_bet_type_rejected(app, calls):
    with pytest.raises(svc.WagerError):
        svc.propose(U1, LG, "ev1", "home", 5000, U2, bet_type="parlay")


def test_bet_type_and_line_in_to_dict(app, calls):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2, bet_type="spread", line=-2.5)
    d = w.to_dict()
    assert d["bet_type"] == "spread" and d["line"] == -2.5


# ---- score-decided settlement: winner claims, push refunds -----------------

def _final(hs, aw, ws=None):
    return {"status": "final", "home_score": hs, "away_score": aw, "winner_side": ws}


def test_moneyline_winner_is_computed_and_claims(app, calls, monkeypatch):
    # U1 backs home; home wins. settle_one stamps U1 as winner (no payout yet).
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: _final(5, 3, ws="home"))
    svc.settle_one(w)
    assert w.status == COMPLETED and w.winner_user_id == U1
    assert not any(op == "payout" for op, *_ in calls)  # not paid until claimed
    # The loser cannot confirm.
    with pytest.raises(svc.WagerError):
        svc.confirm(w, U2)
    # The winner claims -> paid.
    svc.confirm(w, U1)
    assert w.status == SETTLED and ("payout", U1, 10000) in calls


def test_moneyline_loser_backed_away(app, calls, monkeypatch):
    w = svc.propose(U1, LG, "ev1", "away", 5000, U2)  # U1 away; home wins -> U2
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: _final(5, 3, ws="home"))
    svc.settle_one(w)
    assert w.winner_user_id == U2


def test_moneyline_draw_is_push_refunds_both(app, calls, monkeypatch):
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: _final(2, 2, ws="draw"))
    svc.settle_one(w)
    assert w.status == REFUNDED
    assert ("refund", U1, 5000) in calls and ("refund", U2, 5000) in calls


def test_spread_cover(app, calls, monkeypatch):
    # U1 takes home -1.5; home wins by 2 (5-3) -> covers -> U1 wins.
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2, bet_type="spread", line=-1.5)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: _final(5, 3))
    svc.settle_one(w)
    assert w.winner_user_id == U1


def test_spread_no_cover_goes_to_acceptor(app, calls, monkeypatch):
    # U1 takes home -1.5; home wins by only 1 (4-3) -> doesn't cover -> U2.
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2, bet_type="spread", line=-1.5)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: _final(4, 3))
    svc.settle_one(w)
    assert w.winner_user_id == U2


def test_spread_exact_is_push(app, calls, monkeypatch):
    # U1 takes home -2; home wins by exactly 2 -> push.
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2, bet_type="spread", line=-2.0)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: _final(5, 3))
    svc.settle_one(w)
    assert w.status == REFUNDED


def test_total_over_wins(app, calls, monkeypatch):
    # U1 takes Over 8.5; combined 9 -> over -> U1.
    w = svc.propose(U1, LG, "ev1", "over", 5000, U2, bet_type="total", line=8.5)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: _final(5, 4))
    svc.settle_one(w)
    assert w.winner_user_id == U1


def test_total_under_wins(app, calls, monkeypatch):
    # U1 takes Over 8.5; combined 7 -> under -> acceptor.
    w = svc.propose(U1, LG, "ev1", "over", 5000, U2, bet_type="total", line=8.5)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: _final(4, 3))
    svc.settle_one(w)
    assert w.winner_user_id == U2


def test_total_exact_is_push(app, calls, monkeypatch):
    w = svc.propose(U1, LG, "ev1", "under", 5000, U2, bet_type="total", line=7.0)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: _final(4, 3))
    svc.settle_one(w)
    assert w.status == REFUNDED


def test_undeterminable_falls_back_to_concede(app, calls, monkeypatch):
    # No scores/winner_side -> winner can't be computed -> concede flow remains.
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: {"status": "final"})
    svc.settle_one(w)
    assert w.status == COMPLETED and w.winner_user_id is None
    svc.confirm(w, U1, "lost")  # U1 concedes -> U2 paid
    assert w.status == SETTLED and w.winner_user_id == U2


# ---- trash-talk feed post on a decided bet ----------------------------------

def test_completed_post_names_the_winner(app, calls, monkeypatch):
    posts = []
    monkeypatch.setattr(svc, "post_league_activity", lambda lid, p: posts.append(p))
    monkeypatch.setattr(svc, "resolve_users", lambda ids: {U1: "Anky", U2: "Farrell"})
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)  # Anky home
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: _final(5, 3, ws="home"))
    svc.settle_one(w)  # Anky wins
    completed = [p for p in posts if p["event_type"] == "wager_completed"]
    assert completed, "expected a wager_completed post"
    body = completed[-1]["body"]
    assert "Anky" in body and "Farrell" in body
    assert completed[-1]["author_id"] == U1  # winner drives the avatar


def test_completed_post_aggregates_multiple_losers(app, calls, monkeypatch):
    posts = []
    monkeypatch.setattr(svc, "post_league_activity", lambda lid, p: posts.append(p))
    monkeypatch.setattr(svc, "resolve_users",
                        lambda ids: {U1: "Anky", U2: "Farrell", U3: "Johnny"})
    results = svc.propose_many(U1, LG, "ev1", "home", 1000, [U2, U3])
    wagers = [r["wager"] for r in results]
    for wg in wagers:
        svc.accept(wg, wg.acceptor_id)
    monkeypatch.setattr(svc, "get_event", lambda eid: _final(5, 3, ws="home"))
    for wg in wagers:
        svc.settle_one(wg)
    completed = [p for p in posts if p["event_type"] == "wager_completed"]
    # One upserted post (same dedup_key), naming both losers.
    assert len({p["dedup_key"] for p in completed}) == 1
    body = completed[-1]["body"]
    assert "Anky" in body and "Farrell" in body and "Johnny" in body


def test_undeterminable_keeps_ready_to_settle(app, calls, monkeypatch):
    posts = []
    monkeypatch.setattr(svc, "post_league_activity", lambda lid, p: posts.append(p))
    w = svc.propose(U1, LG, "ev1", "home", 5000, U2)
    svc.accept(w, U2)
    monkeypatch.setattr(svc, "get_event", lambda eid: {"status": "final"})
    svc.settle_one(w)  # no score -> undeterminable
    completed = [p for p in posts if p["event_type"] == "wager_completed"]
    assert completed and completed[-1]["title"] == "A bet is ready to settle"
