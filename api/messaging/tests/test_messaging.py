API = "/v1/social/messaging"
from tests.conftest import LEAGUE_ID, U1, U2


def test_direct_dm_flow(client, auth_headers):
    r = client.post(
        f"{API}/conversations",
        json={"type": "direct", "user_id": U2},
        headers=auth_headers(U1),
    )
    assert r.status_code == 201
    cid = r.get_json()["conversation"]["id"]

    r = client.post(
        f"{API}/conversations/{cid}/messages",
        json={"body": "hey"},
        headers=auth_headers(U1),
    )
    assert r.status_code == 201

    r = client.get(f"{API}/conversations/{cid}/messages", headers=auth_headers(U2))
    assert r.status_code == 200
    assert len(r.get_json()["messages"]) == 1


def test_league_chat(client, auth_headers):
    r = client.post(
        f"{API}/conversations",
        json={"type": "league", "league_id": LEAGUE_ID},
        headers=auth_headers(U1),
    )
    assert r.status_code == 201

    r2 = client.post(
        f"{API}/conversations",
        json={"type": "league", "league_id": LEAGUE_ID},
        headers=auth_headers(U2),
    )
    assert r2.status_code == 200
    assert r2.get_json()["conversation"]["id"] == r.get_json()["conversation"]["id"]


def test_non_friend_direct_blocked(client, auth_headers, monkeypatch):
    from app.services import service_messaging as svc

    monkeypatch.setattr(svc, "_are_friends", lambda a, b: False)
    monkeypatch.setattr(svc, "_share_league_membership", lambda a, b: False)
    r = client.post(
        f"{API}/conversations",
        json={"type": "direct", "user_id": U2},
        headers=auth_headers(U1),
    )
    assert r.status_code == 403


def test_league_members_can_dm_without_friendship(client, auth_headers, monkeypatch):
    from app.services import service_messaging as svc

    monkeypatch.setattr(svc, "_are_friends", lambda a, b: False)
    monkeypatch.setattr(svc, "_share_league_membership", lambda a, b: True)
    r = client.post(
        f"{API}/conversations",
        json={"type": "direct", "user_id": U2},
        headers=auth_headers(U1),
    )
    assert r.status_code == 201


def test_unread_and_mark_read(client, auth_headers):
    r = client.post(
        f"{API}/conversations",
        json={"type": "direct", "user_id": U2},
        headers=auth_headers(U1),
    )
    cid = r.get_json()["conversation"]["id"]

    client.post(
        f"{API}/conversations/{cid}/messages",
        json={"body": "ping"},
        headers=auth_headers(U1),
    )

    unread = client.get(f"{API}/conversations/unread-count", headers=auth_headers(U2))
    assert unread.status_code == 200
    body = unread.get_json()
    assert body["total"] == 1
    assert body["by_conv"][cid] == 1

    listed = client.get(f"{API}/conversations", headers=auth_headers(U2))
    row = next(c for c in listed.get_json()["conversations"] if c["id"] == cid)
    assert row["unread_count"] == 1
    assert row["other_user"]["id"] == U1

    read = client.post(f"{API}/conversations/{cid}/read", headers=auth_headers(U2))
    assert read.status_code == 200

    unread2 = client.get(f"{API}/conversations/unread-count", headers=auth_headers(U2))
    assert unread2.get_json()["total"] == 0

    denied = client.post(f"{API}/conversations/{cid}/read", headers=auth_headers("cccccccc-cccc-cccc-cccc-cccccccccccc"))
    assert denied.status_code == 404

    msgs = client.get(f"{API}/conversations/{cid}/messages", headers=auth_headers(U1))
    assert msgs.get_json()["messages"][0].get("read_at")


def test_edit_and_delete_message(client, auth_headers):
    r = client.post(
        f"{API}/conversations",
        json={"type": "direct", "user_id": U2},
        headers=auth_headers(U1),
    )
    cid = r.get_json()["conversation"]["id"]
    sent = client.post(
        f"{API}/conversations/{cid}/messages",
        json={"body": "hello"},
        headers=auth_headers(U1),
    )
    mid = sent.get_json()["message"]["id"]

    edited = client.patch(
        f"{API}/messages/{mid}",
        json={"body": "hello again"},
        headers=auth_headers(U1),
    )
    assert edited.status_code == 200
    assert edited.get_json()["message"]["body"] == "hello again"
    assert edited.get_json()["message"]["edited_at"]

    forbidden = client.patch(
        f"{API}/messages/{mid}",
        json={"body": "nope"},
        headers=auth_headers(U2),
    )
    assert forbidden.status_code == 403

    deleted = client.delete(f"{API}/messages/{mid}", headers=auth_headers(U1))
    assert deleted.status_code == 200
    assert deleted.get_json()["message"]["deleted"] is True


def test_send_rate_limit(client, auth_headers, monkeypatch):
    from app.services import service_rate

    monkeypatch.setattr(service_rate, "allow_send", lambda _uid: False)
    r = client.post(
        f"{API}/conversations",
        json={"type": "direct", "user_id": U2},
        headers=auth_headers(U1),
    )
    cid = r.get_json()["conversation"]["id"]
    blocked = client.post(
        f"{API}/conversations/{cid}/messages",
        json={"body": "spam"},
        headers=auth_headers(U1),
    )
    assert blocked.status_code == 429


def test_typing_endpoint(client, auth_headers):
    r = client.post(
        f"{API}/conversations",
        json={"type": "direct", "user_id": U2},
        headers=auth_headers(U1),
    )
    cid = r.get_json()["conversation"]["id"]
    ok = client.post(
        f"{API}/conversations/{cid}/typing",
        json={"typing": True},
        headers=auth_headers(U1),
    )
    assert ok.status_code == 200


def test_league_list_uses_membership_filter(client, auth_headers, monkeypatch):
    from app.services import service_messaging as svc

    monkeypatch.setattr(svc, "_user_league_ids", lambda uid: [])
    client.post(
        f"{API}/conversations",
        json={"type": "league", "league_id": LEAGUE_ID},
        headers=auth_headers(U1),
    )
    listed = client.get(f"{API}/conversations", headers=auth_headers(U2))
    assert listed.status_code == 200
    assert listed.get_json()["conversations"] == []