"""Unified /c/<code> resolve + act for friend invite codes, and /my-code."""
import uuid

from tests.conftest import API_PREFIX

OWNER = str(uuid.uuid4())


def _my_code(client, auth_headers, uid):
    r = client.get(f"{API_PREFIX}/my-code", headers=auth_headers(uid))
    assert r.status_code == 200
    return r.get_json()["code"]


def test_my_code_is_stable_and_prefixed(client, auth_headers):
    c1 = _my_code(client, auth_headers, OWNER)
    c2 = _my_code(client, auth_headers, OWNER)
    assert c1.startswith("F")
    assert c1 == c2  # get-or-create returns the same reusable code


def test_resolve_unauthenticated_shows_preview(client, auth_headers):
    code = _my_code(client, auth_headers, OWNER)
    r = client.get(f"{API_PREFIX}/c/{code}")  # no auth
    assert r.status_code == 200
    d = r.get_json()
    assert d["type"] == "friend"
    assert d["target_id"] == OWNER
    assert d["state"] == "ok"
    assert d["viewer"]["authenticated"] is False
    assert d["preview"]["user"]["id"] == OWNER
    assert d["actions"] == []


def test_resolve_stranger_can_add(client, auth_headers):
    code = _my_code(client, auth_headers, OWNER)
    viewer = str(uuid.uuid4())
    d = client.get(f"{API_PREFIX}/c/{code}", headers=auth_headers(viewer)).get_json()
    assert d["viewer"]["relationship"] == "none"
    assert d["actions"] == ["add"]


def test_resolve_owner_sees_self_no_actions(client, auth_headers):
    code = _my_code(client, auth_headers, OWNER)
    d = client.get(f"{API_PREFIX}/c/{code}", headers=auth_headers(OWNER)).get_json()
    assert d["viewer"]["relationship"] == "self"
    assert d["actions"] == []


def test_act_add_creates_pending_request(client, auth_headers):
    code = _my_code(client, auth_headers, OWNER)
    viewer = str(uuid.uuid4())
    r = client.post(f"{API_PREFIX}/c/{code}/act", json={"action": "add"},
                    headers=auth_headers(viewer))
    assert r.status_code == 200
    assert r.get_json() == {"type": "friend", "target_id": OWNER}
    # Owner now has an incoming request.
    reqs = client.get(f"{API_PREFIX}/requests", headers=auth_headers(OWNER)).get_json()
    assert any(x["user_id"] == viewer for x in reqs["incoming"])


def test_already_friends_offers_no_action(client, auth_headers):
    code = _my_code(client, auth_headers, OWNER)
    viewer = str(uuid.uuid4())
    client.post(f"{API_PREFIX}/c/{code}/act", json={"action": "add"}, headers=auth_headers(viewer))
    reqs = client.get(f"{API_PREFIX}/requests", headers=auth_headers(OWNER)).get_json()
    req_id = next(x["id"] for x in reqs["incoming"] if x["user_id"] == viewer)
    client.post(f"{API_PREFIX}/requests/{req_id}/accept", headers=auth_headers(OWNER))

    d = client.get(f"{API_PREFIX}/c/{code}", headers=auth_headers(viewer)).get_json()
    assert d["viewer"]["relationship"] == "friends"
    assert d["actions"] == []


def test_pending_incoming_can_accept_via_code(client, auth_headers):
    # OWNER sends VIEWER a request first; VIEWER opens OWNER's link and accepts.
    code = _my_code(client, auth_headers, OWNER)
    viewer = str(uuid.uuid4())
    client.post(f"{API_PREFIX}/requests", json={"user_id": viewer}, headers=auth_headers(OWNER))

    d = client.get(f"{API_PREFIX}/c/{code}", headers=auth_headers(viewer)).get_json()
    assert d["viewer"]["relationship"] == "pending_in"
    assert d["actions"] == ["accept", "decline"]

    r = client.post(f"{API_PREFIX}/c/{code}/act", json={"action": "accept"},
                    headers=auth_headers(viewer))
    assert r.status_code == 200
    friends = client.get(f"{API_PREFIX}/", headers=auth_headers(viewer)).get_json()["friends"]
    assert any(f["user_id"] == OWNER for f in friends)


def test_resolve_invalid_code(client, auth_headers):
    r = client.get(f"{API_PREFIX}/c/FZZZZZZ", headers=auth_headers(OWNER))
    assert r.status_code == 404
    assert r.get_json()["state"] == "invalid"


def test_cannot_add_yourself_via_code(client, auth_headers):
    code = _my_code(client, auth_headers, OWNER)
    r = client.post(f"{API_PREFIX}/c/{code}/act", json={"action": "add"},
                    headers=auth_headers(OWNER))
    assert r.status_code == 400


def test_single_use_code_consumes(client, auth_headers, app):
    from app.extensions import db
    from app.models.invite_code import FriendInviteCode
    from app.services import service_friends as svc

    with app.app_context():
        code = svc.generate_friend_code()
        db.session.add(FriendInviteCode(code=code, owner_id=OWNER, single_use=True))
        db.session.commit()

    viewer = str(uuid.uuid4())
    r1 = client.post(f"{API_PREFIX}/c/{code}/act", json={"action": "add"},
                     headers=auth_headers(viewer))
    assert r1.status_code == 200
    d = client.get(f"{API_PREFIX}/c/{code}", headers=auth_headers(str(uuid.uuid4()))).get_json()
    assert d["state"] == "consumed"
    assert d["actions"] == []
