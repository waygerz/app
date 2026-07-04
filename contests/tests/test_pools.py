import pytest

from app.services import service_pools as svc
from app.models.pool import OPEN, SETTLED, REFUNDED, CANCELLED

U1 = "11111111-1111-1111-1111-111111111111"
U2 = "22222222-2222-2222-2222-222222222222"
U3 = "33333333-3333-3333-3333-333333333333"
LG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


@pytest.fixture()
def calls(monkeypatch):
    """Stub the cross-service clients; record account-scoped wallet ops.

    Pool-flavoured: league_context returns league_type 'pool'.
    """
    recorded = []
    monkeypatch.setattr(
        svc,
        "league_context",
        lambda lid: {
            "league_id": lid,
            "league_type": "pool",
            "commissioner_id": "00000000-0000-0000-0000-000000000000",
            "status": "active",
            "account": f"league:{lid}",
            "period_id": "11111111-1111-1111-1111-111111111111",
            "period_status": "open",
            "min_wager_cents": None,
            "max_wager_cents": None,
            "starting_balance_cents": 100000,
            "rules": {},
            "sport_league_ids": [],
        },
    )
    monkeypatch.setattr(
        svc,
        "get_event",
        lambda eid: {
            "name": "Away at Home",
            "league": "nba",
            "home_team": "Home",
            "away_team": "Away",
            "start_time": None,
            "status": "scheduled",
            "winner_side": None,
        },
    )
    monkeypatch.setattr(svc, "post_league_activity", lambda lid, payload: None)
    monkeypatch.setattr(svc, "hold", lambda acct, u, a, r: recorded.append(("hold", u, a)))
    monkeypatch.setattr(svc, "payout", lambda acct, u, a, r: recorded.append(("payout", u, a)))
    monkeypatch.setattr(svc, "refund", lambda acct, u, a, r: recorded.append(("refund", u, a)))
    return recorded


def test_stake_holds_and_creates_one_pool(app, calls):
    s1, p1 = svc.place_stake(U1, LG, "ev1", "home", 6000)
    s2, p2 = svc.place_stake(U2, LG, "ev1", "away", 3000)
    assert p1.id == p2.id  # one pool per (league, event)
    assert p1.status == OPEN
    assert ("hold", U1, 6000) in calls
    assert ("hold", U2, 3000) in calls


def test_parimutuel_payout_splits_pot_proportionally(app, calls, monkeypatch):
    # U1 6000 home, U2 3000 home, U3 9000 away → pot 18000; away wins.
    svc.place_stake(U1, LG, "ev1", "home", 6000)
    svc.place_stake(U2, LG, "ev1", "home", 3000)
    _, pool = svc.place_stake(U3, LG, "ev1", "away", 9000)

    monkeypatch.setattr(
        svc, "get_event", lambda eid: {"status": "final", "winner_side": "away"}
    )
    svc.settle_pool(pool)
    assert pool.status == SETTLED and pool.winner_side == "away"
    # Sole winning stake takes the whole pot.
    assert ("payout", U3, 18000) in calls
    assert not any(op == "payout" and u != U3 for (op, u, a) in calls)


def test_parimutuel_splits_among_multiple_winners(app, calls, monkeypatch):
    # Two winners on home (6000 + 3000 = 9000), one loser away 9000 → pot 18000.
    svc.place_stake(U1, LG, "ev1", "home", 6000)
    svc.place_stake(U2, LG, "ev1", "home", 3000)
    _, pool = svc.place_stake(U3, LG, "ev1", "away", 9000)

    monkeypatch.setattr(
        svc, "get_event", lambda eid: {"status": "final", "winner_side": "home"}
    )
    svc.settle_pool(pool)
    assert pool.status == SETTLED
    # U1: 6000*18000//9000 = 12000 ; U2: 3000*18000//9000 = 6000
    assert ("payout", U1, 12000) in calls
    assert ("payout", U2, 6000) in calls


def test_settle_draw_refunds_all(app, calls, monkeypatch):
    svc.place_stake(U1, LG, "ev1", "home", 6000)
    _, pool = svc.place_stake(U2, LG, "ev1", "away", 3000)
    monkeypatch.setattr(
        svc, "get_event", lambda eid: {"status": "final", "winner_side": "draw"}
    )
    svc.settle_pool(pool)
    assert pool.status == REFUNDED
    assert ("refund", U1, 6000) in calls and ("refund", U2, 3000) in calls


def test_settle_cancelled_refunds_all(app, calls, monkeypatch):
    svc.place_stake(U1, LG, "ev1", "home", 6000)
    _, pool = svc.place_stake(U2, LG, "ev1", "away", 3000)
    monkeypatch.setattr(svc, "get_event", lambda eid: {"status": "cancelled"})
    svc.settle_pool(pool)
    assert pool.status == CANCELLED
    assert ("refund", U1, 6000) in calls and ("refund", U2, 3000) in calls


def test_settle_no_winning_stakes_refunds_all(app, calls, monkeypatch):
    # Everyone backed home; away wins → nobody on winner → refund all.
    svc.place_stake(U1, LG, "ev1", "home", 6000)
    _, pool = svc.place_stake(U2, LG, "ev1", "home", 3000)
    monkeypatch.setattr(
        svc, "get_event", lambda eid: {"status": "final", "winner_side": "away"}
    )
    svc.settle_pool(pool)
    assert pool.status == REFUNDED
    assert ("refund", U1, 6000) in calls and ("refund", U2, 3000) in calls


def test_settle_noop_when_event_not_final(app, calls):
    _, pool = svc.place_stake(U1, LG, "ev1", "home", 6000)
    svc.settle_pool(pool)  # default mocked event is still 'scheduled'
    assert pool.status == OPEN


def test_stake_enforces_min_wager(app, calls, monkeypatch):
    monkeypatch.setattr(svc, "league_context", lambda lid: {
        "league_type": "pool", "status": "active", "account": f"league:{lid}",
        "period_status": "open", "rules": {}, "sport_league_ids": [],
        "period_id": None, "min_wager_cents": 10000, "max_wager_cents": None,
    })
    with pytest.raises(svc.PoolError):
        svc.place_stake(U1, LG, "ev1", "home", 5000)


def test_stake_rejects_non_pool_league(app, calls, monkeypatch):
    monkeypatch.setattr(svc, "league_context", lambda lid: {
        "league_type": "head_to_head", "status": "active", "account": f"league:{lid}",
        "period_status": "open", "rules": {}, "sport_league_ids": [],
        "period_id": None, "min_wager_cents": None, "max_wager_cents": None,
    })
    with pytest.raises(svc.PoolError):
        svc.place_stake(U1, LG, "ev1", "home", 5000)


def test_stake_rejects_bad_side(app, calls):
    with pytest.raises(svc.PoolError):
        svc.place_stake(U1, LG, "ev1", "sideways", 5000)


def test_settle_due_pools_settles_started_pools(app, calls, monkeypatch):
    svc.place_stake(U1, LG, "ev1", "home", 6000)
    svc.place_stake(U2, LG, "ev1", "away", 6000)
    monkeypatch.setattr(
        svc, "get_event", lambda eid: {"status": "final", "winner_side": "home"}
    )
    monkeypatch.setattr(svc, "refresh_event", lambda eid: None)
    n = svc.settle_due_pools()
    assert n == 1
