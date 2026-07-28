import uuid

API_PREFIX = "/v1/social/comments"
POST_ID = "11111111-1111-1111-1111-111111111111"
U1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
U2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


def test_create_and_list_comments(client, auth_headers):
    r = client.post(
        f"{API_PREFIX}/posts/{POST_ID}/comments",
        json={"body": "Great update!"},
        headers=auth_headers(U1),
    )
    assert r.status_code == 201
    assert r.get_json()["comment"]["body"] == "Great update!"

    r = client.get(
        f"{API_PREFIX}/posts/{POST_ID}/comments",
        headers=auth_headers(U1),
    )
    assert r.status_code == 200
    comments = r.get_json()["comments"]
    assert len(comments) == 1
    assert comments[0]["author_name"] == f"User {U1[:4]}"


def test_reply_to_comment(client, auth_headers):
    parent = client.post(
        f"{API_PREFIX}/posts/{POST_ID}/comments",
        json={"body": "Parent"},
        headers=auth_headers(U1),
    ).get_json()["comment"]["id"]

    r = client.post(
        f"{API_PREFIX}/posts/{POST_ID}/comments",
        json={"body": "Reply here", "parent_id": parent},
        headers=auth_headers(U2),
    )
    assert r.status_code == 201

    comments = client.get(
        f"{API_PREFIX}/posts/{POST_ID}/comments",
        headers=auth_headers(U1),
    ).get_json()["comments"]
    assert len(comments) == 1
    assert len(comments[0]["replies"]) == 1
    assert comments[0]["replies"][0]["body"] == "Reply here"


def test_toggle_like_and_engagement(client, auth_headers):
    r = client.post(f"{API_PREFIX}/posts/{POST_ID}/like", headers=auth_headers(U1))
    assert r.status_code == 200
    assert r.get_json()["liked"] is True
    assert r.get_json()["like_count"] == 1

    r = client.post(f"{API_PREFIX}/posts/{POST_ID}/like", headers=auth_headers(U1))
    assert r.get_json()["liked"] is False
    assert r.get_json()["like_count"] == 0

    client.post(
        f"{API_PREFIX}/posts/{POST_ID}/comments",
        json={"body": "hi"},
        headers=auth_headers(U1),
    )
    eng = client.post(
        f"{API_PREFIX}/posts/engagement",
        json={"post_ids": [POST_ID]},
        headers=auth_headers(U1),
    ).get_json()["posts"][POST_ID]
    assert eng["comment_count"] == 1


def test_reject_empty_body(client, auth_headers):
    r = client.post(
        f"{API_PREFIX}/posts/{POST_ID}/comments",
        json={"body": "   "},
        headers=auth_headers(U1),
    )
    assert r.status_code == 400


def test_delete_own_comment(client, auth_headers):
    r = client.post(
        f"{API_PREFIX}/posts/{POST_ID}/comments",
        json={"body": "temp"},
        headers=auth_headers(U1),
    )
    cid = r.get_json()["comment"]["id"]

    assert client.delete(
        f"{API_PREFIX}/comments/{cid}",
        headers=auth_headers(U2),
    ).status_code == 403

    assert client.delete(
        f"{API_PREFIX}/comments/{cid}",
        headers=auth_headers(U1),
    ).status_code == 200


def test_unknown_post(client, auth_headers):
    r = client.get(
        f"{API_PREFIX}/posts/{uuid.uuid4()}/comments",
        headers=auth_headers(U1),
    )
    assert r.status_code == 404