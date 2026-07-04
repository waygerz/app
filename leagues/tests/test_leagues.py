import uuid

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


def test_create_league(client, auth_headers):
    r = _create(client, auth_headers(U1))
    assert r.status_code == 201
    d = r.get_json()["league"]
    assert d["status"] == "draft" and d["league_type"] == "head_to_head"
    assert d["join_code"].startswith("WAYG-")
    assert d["my_role"] == "commissioner"
    assert len(d["members"]) == 1
    assert [s["sport_league_id"] for s in d["sports"]] == ["NBA"]


def test_pickem_needs_no_balance(client, auth_headers):
    r = _create(client, auth_headers(U1), league_type="pickem", starting_balance_cents=None)
    assert r.status_code == 201
    assert r.get_json()["league"]["starting_balance_cents"] is None


def test_money_league_requires_starting_balance(client, auth_headers):
    assert _create(client, auth_headers(U1), starting_balance_cents=0).status_code == 400


def test_requires_a_sport(client, auth_headers):
    assert _create(client, auth_headers(U1), sports=[]).status_code == 400


def test_invalid_type_rejected(client, auth_headers):
    assert _create(client, auth_headers(U1), league_type="nope").status_code == 400


def test_my_leagues_lists_membership(client, auth_headers):
    _create(client, auth_headers(U1))
    cards = client.get(f"{API_PREFIX}/", headers=auth_headers(U1)).get_json()["leagues"]
    assert len(cards) == 1
    assert cards[0]["member_count"] == 1
    assert cards[0]["my_balance_cents"] == 0  # money league, not yet granted


def test_activate_opens_first_period(client, auth_headers):
    cid = _create(client, auth_headers(U1)).get_json()["league"]["id"]
    d = client.post(f"/v1/gameplay/leagues/{cid}/activate", headers=auth_headers(U1)).get_json()["league"]
    assert d["status"] == "active"
    assert d["current_period"]["status"] == "open"


def test_only_commish_activates(client, auth_headers):
    cid = _create(client, auth_headers(U1)).get_json()["league"]["id"]
    other = str(uuid.uuid4())
    # non-member -> 404 (can't even see it)
    assert client.post(f"/v1/gameplay/leagues/{cid}/activate", headers=auth_headers(other)).status_code == 404


def test_feed_records_creation(client, auth_headers):
    cid = _create(client, auth_headers(U1)).get_json()["league"]["id"]
    feed = client.get(f"/v1/gameplay/leagues/{cid}/feed", headers=auth_headers(U1)).get_json()["feed"]
    assert any(i["event_type"] == "league_created" for i in feed)


def test_unread_feed_count_on_dashboard(client, auth_headers):
    cid = _create(client, auth_headers(U1)).get_json()["league"]["id"]
    cards = client.get(f"{API_PREFIX}/", headers=auth_headers(U1)).get_json()["leagues"]
    assert cards[0]["unread_feed_count"] >= 1
    client.get(f"/v1/gameplay/leagues/{cid}/feed", headers=auth_headers(U1))
    cards2 = client.get(f"{API_PREFIX}/", headers=auth_headers(U1)).get_json()["leagues"]
    assert cards2[0]["unread_feed_count"] == 0


def test_commish_posts_announcement(client, auth_headers):
    cid = _create(client, auth_headers(U1)).get_json()["league"]["id"]
    r = client.post(
        f"/v1/gameplay/leagues/{cid}/feed",
        json={"title": "Welcome", "body": "Good luck!", "link_url": "https://x.test", "link_label": "site"},
        headers=auth_headers(U1),
    )
    assert r.status_code == 201
    feed = client.get(f"/v1/gameplay/leagues/{cid}/feed", headers=auth_headers(U1)).get_json()["feed"]
    assert any(i["kind"] == "announcement" and i["title"] == "Welcome" for i in feed)


def test_non_member_cannot_view(client, auth_headers):
    cid = _create(client, auth_headers(U1)).get_json()["league"]["id"]
    assert client.get(f"/v1/gameplay/leagues/{cid}", headers=auth_headers(str(uuid.uuid4()))).status_code == 404


# ---- Phase 3: membership --------------------------------------------------
def test_join_by_code(client, auth_headers):
    created = _create(client, auth_headers(U1)).get_json()["league"]
    u2 = str(uuid.uuid4())
    r = client.post("/v1/gameplay/leagues/join", json={"code": created["join_code"]}, headers=auth_headers(u2))
    assert r.status_code == 201
    assert any(m["user_id"] == u2 for m in r.get_json()["league"]["members"])
    cards = client.get(f"{API_PREFIX}/", headers=auth_headers(u2)).get_json()["leagues"]
    assert len(cards) == 1


def test_join_is_idempotent(client, auth_headers):
    created = _create(client, auth_headers(U1)).get_json()["league"]
    u2 = str(uuid.uuid4())
    client.post("/v1/gameplay/leagues/join", json={"code": created["join_code"]}, headers=auth_headers(u2))
    client.post("/v1/gameplay/leagues/join", json={"code": created["join_code"]}, headers=auth_headers(u2))
    d = client.get(f"/v1/gameplay/leagues/{created['id']}", headers=auth_headers(u2)).get_json()["league"]
    assert sum(1 for m in d["members"] if m["user_id"] == u2) == 1


def test_join_feed_records_member_joined(client, auth_headers):
    created = _create(client, auth_headers(U1)).get_json()["league"]
    u2 = str(uuid.uuid4())
    client.post("/v1/gameplay/leagues/join", json={"code": created["join_code"]}, headers=auth_headers(u2))
    feed = client.get(f"/v1/gameplay/leagues/{created['id']}/feed", headers=auth_headers(u2)).get_json()["feed"]
    assert any(i["event_type"] == "member_joined" for i in feed)


def test_invite_and_accept(client, auth_headers):
    lid = _create(client, auth_headers(U1)).get_json()["league"]["id"]
    u2 = str(uuid.uuid4())
    r = client.post(f"/v1/gameplay/leagues/{lid}/invites", json={"invitee_ids": [u2]}, headers=auth_headers(U1))
    assert r.status_code == 201 and u2 in r.get_json()["invited"]
    invites = client.get("/v1/gameplay/leagues/invites", headers=auth_headers(u2)).get_json()["invites"]
    assert len(invites) == 1 and invites[0]["league_id"] == lid
    assert client.post(f"/v1/gameplay/leagues/{lid}/join", headers=auth_headers(u2)).status_code == 201
    assert client.get("/v1/gameplay/leagues/invites", headers=auth_headers(u2)).get_json()["invites"] == []


def test_member_can_leave_commish_cannot(client, auth_headers):
    created = _create(client, auth_headers(U1)).get_json()["league"]
    lid, code = created["id"], created["join_code"]
    u2 = str(uuid.uuid4())
    client.post("/v1/gameplay/leagues/join", json={"code": code}, headers=auth_headers(u2))
    assert client.post(f"/v1/gameplay/leagues/{lid}/leave", headers=auth_headers(u2)).status_code == 200
    assert client.get(f"/v1/gameplay/leagues/{lid}", headers=auth_headers(u2)).status_code == 404
    assert client.post(f"/v1/gameplay/leagues/{lid}/leave", headers=auth_headers(U1)).status_code == 400
