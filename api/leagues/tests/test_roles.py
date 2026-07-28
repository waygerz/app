"""Moderator role + commissioner transfer."""
import uuid

from tests.conftest import API_PREFIX

C = str(uuid.uuid4())  # the creating commissioner


def _league(client, auth_headers):
    r = client.post(
        f"{API_PREFIX}/",
        json={
            "name": "Roles League",
            "league_type": "head_to_head",
            "period_type": "season",
            "starting_balance_cents": 100000,
            "sports": ["NBA"],
        },
        headers=auth_headers(C),
    )
    d = r.get_json()["league"]
    return d["id"], d["join_code"]


def _join(client, auth_headers, code, uid):
    client.post(f"{API_PREFIX}/join", json={"code": code}, headers=auth_headers(uid))


def _detail(client, auth_headers, lid, uid):
    return client.get(f"{API_PREFIX}/{lid}", headers=auth_headers(uid)).get_json()["league"]


def _role_of(detail, uid):
    return next((m["role"] for m in detail["members"] if m["user_id"] == uid), None)


def _set_role(client, auth_headers, lid, uid, role, actor):
    return client.patch(
        f"{API_PREFIX}/{lid}/members/{uid}/role", json={"role": role}, headers=auth_headers(actor)
    )


def test_commish_promotes_and_demotes_moderator(client, auth_headers):
    lid, code = _league(client, auth_headers)
    u2 = str(uuid.uuid4())
    _join(client, auth_headers, code, u2)
    assert _set_role(client, auth_headers, lid, u2, "moderator", C).status_code == 200
    assert _role_of(_detail(client, auth_headers, lid, C), u2) == "moderator"
    assert _set_role(client, auth_headers, lid, u2, "member", C).status_code == 200
    assert _role_of(_detail(client, auth_headers, lid, C), u2) == "member"


def test_non_commish_cannot_change_roles(client, auth_headers):
    lid, code = _league(client, auth_headers)
    u2, u3 = str(uuid.uuid4()), str(uuid.uuid4())
    _join(client, auth_headers, code, u2)
    _join(client, auth_headers, code, u3)
    assert _set_role(client, auth_headers, lid, u3, "moderator", u2).status_code == 403


def test_invalid_role_rejected(client, auth_headers):
    lid, code = _league(client, auth_headers)
    u2 = str(uuid.uuid4())
    _join(client, auth_headers, code, u2)
    assert _set_role(client, auth_headers, lid, u2, "commissioner", C).status_code == 400


def test_moderator_can_post_and_remove(client, auth_headers):
    lid, code = _league(client, auth_headers)
    mod, victim = str(uuid.uuid4()), str(uuid.uuid4())
    _join(client, auth_headers, code, mod)
    _join(client, auth_headers, code, victim)
    _set_role(client, auth_headers, lid, mod, "moderator", C)
    assert client.post(f"{API_PREFIX}/{lid}/feed", json={"body": "hi"}, headers=auth_headers(mod)).status_code == 201
    assert client.delete(f"{API_PREFIX}/{lid}/members/{victim}", headers=auth_headers(mod)).status_code == 200


def test_member_cannot_post(client, auth_headers):
    lid, code = _league(client, auth_headers)
    u2 = str(uuid.uuid4())
    _join(client, auth_headers, code, u2)
    assert client.post(f"{API_PREFIX}/{lid}/feed", json={"body": "hi"}, headers=auth_headers(u2)).status_code == 403


def test_moderator_cannot_remove_commish_or_other_mod(client, auth_headers):
    lid, code = _league(client, auth_headers)
    mod1, mod2 = str(uuid.uuid4()), str(uuid.uuid4())
    _join(client, auth_headers, code, mod1)
    _join(client, auth_headers, code, mod2)
    _set_role(client, auth_headers, lid, mod1, "moderator", C)
    _set_role(client, auth_headers, lid, mod2, "moderator", C)
    assert client.delete(f"{API_PREFIX}/{lid}/members/{C}", headers=auth_headers(mod1)).status_code == 400
    assert client.delete(f"{API_PREFIX}/{lid}/members/{mod2}", headers=auth_headers(mod1)).status_code == 403


def test_transfer_commissioner(client, auth_headers):
    lid, code = _league(client, auth_headers)
    u2 = str(uuid.uuid4())
    _join(client, auth_headers, code, u2)
    assert client.post(f"{API_PREFIX}/{lid}/members/{u2}/transfer", headers=auth_headers(C)).status_code == 200
    d = _detail(client, auth_headers, lid, u2)
    assert d["my_role"] == "commissioner"
    assert _role_of(d, u2) == "commissioner"
    assert _role_of(d, C) == "moderator"
    # the outgoing commissioner (now a moderator) can no longer transfer
    assert client.post(f"{API_PREFIX}/{lid}/members/{C}/transfer", headers=auth_headers(C)).status_code == 403
    # the new commissioner has a commissioner-only power (archive)
    assert client.post(f"{API_PREFIX}/{lid}/archive", headers=auth_headers(u2)).status_code == 200


def test_non_commish_cannot_transfer(client, auth_headers):
    lid, code = _league(client, auth_headers)
    u2 = str(uuid.uuid4())
    _join(client, auth_headers, code, u2)
    assert client.post(f"{API_PREFIX}/{lid}/members/{u2}/transfer", headers=auth_headers(u2)).status_code == 403


def test_transfer_to_non_member_404(client, auth_headers):
    lid, _ = _league(client, auth_headers)
    stranger = str(uuid.uuid4())
    assert client.post(f"{API_PREFIX}/{lid}/members/{stranger}/transfer", headers=auth_headers(C)).status_code == 404


def test_role_change_and_transfer_blocked_on_archived(client, auth_headers):
    lid, code = _league(client, auth_headers)
    u2 = str(uuid.uuid4())
    _join(client, auth_headers, code, u2)
    assert client.post(f"{API_PREFIX}/{lid}/archive", headers=auth_headers(C)).status_code == 200
    assert _set_role(client, auth_headers, lid, u2, "moderator", C).status_code == 400
    assert client.post(f"{API_PREFIX}/{lid}/members/{u2}/transfer", headers=auth_headers(C)).status_code == 400
