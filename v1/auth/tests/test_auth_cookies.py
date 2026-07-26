"""Passwordless OTP auth: login/signup set cookies, refresh rotates, logout clears."""
from app.utils.cookies import SESSION_MARKER_COOKIE, auth_cookie_names


def _cookie_value(set_cookie_headers: list[str], name: str) -> str | None:
    for header in set_cookie_headers:
        if header.startswith(f"{name}="):
            return header.split("=", 1)[1].split(";", 1)[0]
    return None


def _login(client, user, device_uuid):
    """Existing user: start → verify (returns cookies). dev_otp is revealed in tests."""
    start = client.post("/v1/platform/auth/otp/start", json={"phone": user["phone"]})
    assert start.status_code == 200
    code = start.get_json()["dev_otp"]
    return client.post(
        "/v1/platform/auth/otp/verify",
        json={"phone": user["phone"], "otp": code, "device_uuid": device_uuid},
    )


def test_otp_login_existing_user_sets_cookies(client, user, device_uuid):
    res = _login(client, user, device_uuid)
    assert res.status_code == 200
    data = res.get_json()
    assert "access_token" not in data
    assert data["user"]["phone"] == user["phone"]

    access_name, refresh_name = auth_cookie_names()
    cookies = res.headers.getlist("Set-Cookie")
    assert any(access_name in c for c in cookies)
    assert any(refresh_name in c for c in cookies)
    assert any(SESSION_MARKER_COOKIE in c for c in cookies)


def test_signup_new_user_flow(client, device_uuid):
    phone_raw = "9042398485"  # valid US number, not yet registered
    start = client.post("/v1/platform/auth/otp/start", json={"phone": phone_raw})
    assert start.status_code == 200
    code = start.get_json()["dev_otp"]

    verify = client.post(
        "/v1/platform/auth/otp/verify",
        json={"phone": phone_raw, "otp": code, "device_uuid": device_uuid},
    )
    assert verify.status_code == 200
    body = verify.get_json()
    assert body.get("needs_profile") is True
    assert "user" not in body
    ticket = body["ticket"]

    done = client.post(
        "/v1/platform/auth/otp/complete",
        json={"ticket": ticket, "display_name": "Newbie", "device_uuid": device_uuid},
    )
    assert done.status_code == 201
    assert done.get_json()["user"]["display_name"] == "Newbie"
    access_name, _ = auth_cookie_names()
    assert any(access_name in c for c in done.headers.getlist("Set-Cookie"))


def test_verify_rejects_wrong_code(client, user, device_uuid):
    client.post("/v1/platform/auth/otp/start", json={"phone": user["phone"]})
    bad = client.post(
        "/v1/platform/auth/otp/verify",
        json={"phone": user["phone"], "otp": "000000", "device_uuid": device_uuid},
    )
    assert bad.status_code == 400


def test_complete_rejects_bad_ticket(client, device_uuid):
    res = client.post(
        "/v1/platform/auth/otp/complete",
        json={"ticket": "not-a-real-ticket", "display_name": "X", "device_uuid": device_uuid},
    )
    assert res.status_code == 400


def test_me_accepts_access_cookie(client, user, device_uuid):
    res = _login(client, user, device_uuid)
    access_name, refresh_name = auth_cookie_names()
    access_token = _cookie_value(res.headers.getlist("Set-Cookie"), access_name)
    refresh_token = _cookie_value(res.headers.getlist("Set-Cookie"), refresh_name)
    assert access_token and refresh_token

    client.set_cookie("localhost", access_name, access_token)
    client.set_cookie("localhost", refresh_name, refresh_token)
    me = client.get("/v1/platform/auth/me")
    assert me.status_code == 200
    assert me.get_json()["user"]["id"] == user["id"]


def test_me_accepts_bearer_header(client, app, user, device_uuid):
    """Bearer header remains for tests and internal tooling."""
    from flask_jwt_extended import create_access_token

    with app.app_context():
        token = create_access_token(identity=user["id"], additional_claims={"phone": user["phone"]})
    me = client.get("/v1/platform/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.get_json()["user"]["id"] == user["id"]


def test_refresh_rotates_tokens(client, user, device_uuid):
    res = _login(client, user, device_uuid)
    _, refresh_name = auth_cookie_names()
    refresh_cookie = _cookie_value(res.headers.getlist("Set-Cookie"), refresh_name)
    assert refresh_cookie

    client.set_cookie("localhost", refresh_name, refresh_cookie)
    refreshed = client.post(
        "/v1/platform/auth/refresh",
        headers={"X-Device-UUID": device_uuid},
    )
    assert refreshed.status_code == 200
    assert "access_token" not in refreshed.get_json()
    assert any(refresh_name in c for c in refreshed.headers.getlist("Set-Cookie"))


def test_logout_clears_session(client, user, device_uuid):
    res = _login(client, user, device_uuid)
    access_name, refresh_name = auth_cookie_names()
    access_token = _cookie_value(res.headers.getlist("Set-Cookie"), access_name)
    refresh_cookie = _cookie_value(res.headers.getlist("Set-Cookie"), refresh_name)
    client.set_cookie("localhost", access_name, access_token)
    client.set_cookie("localhost", refresh_name, refresh_cookie)

    out = client.post(
        "/v1/platform/auth/logout",
        headers={"X-Device-UUID": device_uuid},
    )
    assert out.status_code == 200
    cleared = out.headers.getlist("Set-Cookie")
    assert any(f"{access_name}=" in c and "Max-Age=0" in c for c in cleared)

    client.set_cookie("localhost", refresh_name, refresh_cookie)
    again = client.post(
        "/v1/platform/auth/refresh",
        headers={"X-Device-UUID": device_uuid},
    )
    assert again.status_code == 403
