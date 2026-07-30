"""Unified /j/<code> resolve + act for league invite codes."""
import uuid
from datetime import datetime

from tests.conftest import API_PREFIX

U1 = str(uuid.uuid4())


def _create(client, headers, **over):
    payload = {
        "name": "Office NBA",
        "league_type": "head_to_head",
        "period_type": "season",
        "starting_balance_cents": 100000,
        "sports": ["NBA"],
    }
    payload.update(over)
    return client.post(f"{API_PREFIX}/", json=payload, headers=headers)


def test_resolve_unauthenticated_shows_preview(client, auth_headers):
    lg = _create(client, auth_headers(U1)).get_json()["league"]
    r = client.get(f"{API_PREFIX}/j/{lg['invite_code']}")  # no auth
    assert r.status_code == 200
    d = r.get_json()
    assert d["type"] == "league"
    assert d["target_id"] == lg["id"]
    assert d["state"] == "ok"
    assert d["single_use"] is False
    assert d["viewer"]["authenticated"] is False
    assert d["preview"]["name"] == "Office NBA"
    assert d["actions"] == []  # signed-out: no action offered


def test_resolve_authenticated_non_member_can_join(client, auth_headers):
    lg = _create(client, auth_headers(U1)).get_json()["league"]
    u2 = str(uuid.uuid4())
    d = client.get(f"{API_PREFIX}/j/{lg['invite_code']}", headers=auth_headers(u2)).get_json()
    assert d["viewer"]["relationship"] == "none"
    assert d["actions"] == ["join"]


def test_resolve_member_has_no_join_action(client, auth_headers):
    lg = _create(client, auth_headers(U1)).get_json()["league"]
    d = client.get(f"{API_PREFIX}/j/{lg['invite_code']}", headers=auth_headers(U1)).get_json()
    assert d["viewer"]["relationship"] == "member"
    assert d["actions"] == []


def test_resolve_invalid_code(client, auth_headers):
    r = client.get(f"{API_PREFIX}/j/LZZZZZZ", headers=auth_headers(U1))
    assert r.status_code == 404
    assert r.get_json()["state"] == "invalid"


def test_act_join(client, auth_headers):
    lg = _create(client, auth_headers(U1)).get_json()["league"]
    u2 = str(uuid.uuid4())
    r = client.post(f"{API_PREFIX}/j/{lg['invite_code']}/act",
                    json={"action": "join"}, headers=auth_headers(u2))
    assert r.status_code == 200
    assert r.get_json() == {"type": "league", "target_id": lg["id"]}
    cards = client.get(f"{API_PREFIX}/", headers=auth_headers(u2)).get_json()["leagues"]
    assert len(cards) == 1


def test_act_unsupported_action(client, auth_headers):
    lg = _create(client, auth_headers(U1)).get_json()["league"]
    r = client.post(f"{API_PREFIX}/j/{lg['invite_code']}/act",
                    json={"action": "decline"}, headers=auth_headers(str(uuid.uuid4())))
    assert r.status_code == 400


def test_single_use_code_consumes(client, auth_headers, app):
    lg = _create(client, auth_headers(U1)).get_json()["league"]
    from app.extensions import db
    from app.models.invite_code import LeagueInviteCode
    from app.services import service_leagues as svc

    with app.app_context():
        code = svc.generate_league_code()
        db.session.add(LeagueInviteCode(
            code=code, league_id=lg["id"], created_by=U1, single_use=True,
        ))
        db.session.commit()

    u2 = str(uuid.uuid4())
    r1 = client.post(f"{API_PREFIX}/j/{code}/act", json={"action": "join"},
                     headers=auth_headers(u2))
    assert r1.status_code == 200
    # After consumption the code resolves as consumed with no actions.
    d = client.get(f"{API_PREFIX}/j/{code}", headers=auth_headers(str(uuid.uuid4()))).get_json()
    assert d["state"] == "consumed"
    assert d["actions"] == []
    # And a second act is rejected.
    r2 = client.post(f"{API_PREFIX}/j/{code}/act", json={"action": "join"},
                     headers=auth_headers(str(uuid.uuid4())))
    assert r2.status_code == 409


def test_expired_code(client, auth_headers, app):
    lg = _create(client, auth_headers(U1)).get_json()["league"]
    from app.extensions import db
    from app.models.invite_code import LeagueInviteCode
    from app.services import service_leagues as svc

    with app.app_context():
        code = svc.generate_league_code()
        db.session.add(LeagueInviteCode(
            code=code, league_id=lg["id"], created_by=U1, single_use=True,
            expires_at=datetime(2000, 1, 1),
        ))
        db.session.commit()

    d = client.get(f"{API_PREFIX}/j/{code}", headers=auth_headers(str(uuid.uuid4()))).get_json()
    assert d["state"] == "expired"
    assert d["actions"] == []
