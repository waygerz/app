import uuid

from app.extensions import db
from tests.conftest import API_PREFIX
from app.models import period as period_model
from app.models.period import LeaguePeriod

U1 = str(uuid.uuid4())


def _create_pickem(client, headers, **over):
    payload = {
        "name": "Pick'em Pool",
        "league_type": "pickem",
        "period_type": "season",
        "starting_balance_cents": None,
        "sports": ["NFL"],
    }
    payload.update(over)
    return client.post(f"{API_PREFIX}/", json=payload, headers=headers)


def _activate(client, headers, lid):
    return client.post(f"/v1/gameplay/leagues/{lid}/activate", headers=headers)


def _period_id(detail):
    return detail["current_period"]["id"]


def test_create_and_activate_pickem(client, auth_headers):
    r = _create_pickem(client, auth_headers(U1))
    assert r.status_code == 201
    d = r.get_json()["league"]
    assert d["league_type"] == "pickem"
    assert d["starting_balance_cents"] is None
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    assert d["current_period"]["status"] == "open"


def test_submit_and_get_picks(client, auth_headers):
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)

    r = client.put(
        f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
        json={"picks": [{"event_id": "EVT1", "side": "home"},
                        {"event_id": "EVT2", "side": "away"}]},
        headers=auth_headers(U1),
    )
    assert r.status_code == 200
    picks = r.get_json()["picks"]
    assert {p["event_id"]: p["pick_side"] for p in picks} == {"EVT1": "home", "EVT2": "away"}

    got = client.get(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks", headers=auth_headers(U1)).get_json()
    assert len(got["picks"]) == 2
    assert all("event" in p for p in got["picks"])  # scoreboard key present


def test_picks_upsert_changes_side(client, auth_headers):
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    base = {"event_id": "EVT1", "side": "home"}
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks", json={"picks": [base]},
               headers=auth_headers(U1))
    r = client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
                   json={"picks": [{"event_id": "EVT1", "side": "away"}]},
                   headers=auth_headers(U1))
    picks = r.get_json()["picks"]
    assert len(picks) == 1 and picks[0]["pick_side"] == "away"


def test_bad_side_rejected(client, auth_headers):
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    r = client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
                   json={"picks": [{"event_id": "EVT1", "side": "draw"}]},
                   headers=auth_headers(U1))
    assert r.status_code == 400


def test_picks_locked_when_period_not_open(client, auth_headers, app):
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    # close the period directly in the DB
    with app.app_context():
        p = db.session.get(LeaguePeriod, pid)
        p.status = period_model.CLOSED
        db.session.commit()
    r = client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
                   json={"picks": [{"event_id": "EVT1", "side": "home"}]},
                   headers=auth_headers(U1))
    assert r.status_code == 400
    assert "locked" in r.get_json()["error"]


def test_non_member_cannot_pick(client, auth_headers):
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    r = client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
                   json={"picks": [{"event_id": "EVT1", "side": "home"}]},
                   headers=auth_headers(str(uuid.uuid4())))
    assert r.status_code == 404


def test_money_league_rejects_picks(client, auth_headers):
    payload = {
        "name": "Money", "league_type": "head_to_head", "period_type": "season",
        "starting_balance_cents": 100000, "sports": ["NBA"],
    }
    d = client.post(f"{API_PREFIX}/", json=payload, headers=auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    r = client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
                   json={"picks": [{"event_id": "EVT1", "side": "home"}]},
                   headers=auth_headers(U1))
    assert r.status_code == 400


def test_grading_marks_correct_and_incorrect(client, auth_headers, app, monkeypatch):
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    client.put(
        f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
        json={"picks": [{"event_id": "EVT1", "side": "home"},
                        {"event_id": "EVT2", "side": "away"}]},
        headers=auth_headers(U1),
    )

    # EVT1 home wins -> pick(home) correct; EVT2 home wins -> pick(away) wrong.
    finals = {
        "EVT1": {"status": "final", "winner_side": "home"},
        "EVT2": {"status": "final", "winner_side": "home"},
    }
    monkeypatch.setattr(svc, "get_event", lambda eid: finals.get(eid))

    with app.app_context():
        n = svc.grade_open_periods()
    assert n == 2

    got = client.get(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks", headers=auth_headers(U1)).get_json()
    by_event = {p["event_id"]: p["correct"] for p in got["picks"]}
    assert by_event == {"EVT1": True, "EVT2": False}


def test_grading_skips_non_final(client, auth_headers, app, monkeypatch):
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "home"}]},
               headers=auth_headers(U1))
    monkeypatch.setattr(svc, "get_event",
                        lambda eid: {"status": "live", "winner_side": None})
    with app.app_context():
        assert svc.grade_open_periods() == 0


def test_standings_rank_by_wins(client, auth_headers, app, monkeypatch):
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    code = d["join_code"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)

    u2 = str(uuid.uuid4())
    client.post("/v1/gameplay/leagues/join", json={"code": code}, headers=auth_headers(u2))

    # U1 picks both home (wins both); U2 picks both away (loses both).
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "home"},
                               {"event_id": "EVT2", "side": "home"}]},
               headers=auth_headers(U1))
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "away"},
                               {"event_id": "EVT2", "side": "away"}]},
               headers=auth_headers(u2))

    monkeypatch.setattr(svc, "get_event",
                        lambda eid: {"status": "final", "winner_side": "home"})
    with app.app_context():
        svc.grade_open_periods()

    rows = client.get(f"/v1/gameplay/leagues/{lid}/standings", headers=auth_headers(U1)).get_json()["standings"]
    assert rows[0]["user_id"] == U1
    assert rows[0]["wins"] == 2 and rows[0]["losses"] == 0
    by_user = {r["user_id"]: r for r in rows}
    assert by_user[u2]["wins"] == 0 and by_user[u2]["losses"] == 2


def test_money_league_standings_shape(client, auth_headers, monkeypatch):
    """Money standings return per-member balance/net/W-L rows (Phase 5)."""
    from app.services import service_leagues as svc
    monkeypatch.setattr(svc, "wallet_account_balances", lambda account: {U1: 120000})
    monkeypatch.setattr(svc, "contests_league_record",
                        lambda lid: {U1: {"wins": 3, "losses": 1, "pushes": 0}})

    payload = {
        "name": "Money", "league_type": "head_to_head", "period_type": "season",
        "starting_balance_cents": 100000, "sports": ["NBA"],
    }
    d = client.post(f"{API_PREFIX}/", json=payload, headers=auth_headers(U1)).get_json()["league"]
    rows = client.get(f"/v1/gameplay/leagues/{d['id']}/standings", headers=auth_headers(U1)).get_json()["standings"]
    assert len(rows) == 1
    row = rows[0]
    assert row["user_id"] == U1
    assert row["balance_cents"] == 120000
    assert row["net_cents"] == 20000  # 120000 - 100000 starting
    assert row["wins"] == 3 and row["losses"] == 1
