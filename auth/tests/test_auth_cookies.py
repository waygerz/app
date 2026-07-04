"""Cookie auth: login sets cookies, refresh rotates, logout clears."""
from app.utils.cookies import SESSION_MARKER_COOKIE, auth_cookie_names


def _cookie_value(set_cookie_headers: list[str], name: str) -> str | None:
    for header in set_cookie_headers:
        if header.startswith(f"{name}="):
            return header.split("=", 1)[1].split(";", 1)[0]
    return None


def _login(client, user, device_uuid):
    return client.post(
        "/v1/core/auth/login",
        json={"phone": user["phone"], "pin": user["pin"], "device_uuid": device_uuid},
    )


def test_login_sets_cookies_without_json_token(client, user, device_uuid):
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


def test_me_accepts_access_cookie(client, user, device_uuid):
    res = _login(client, user, device_uuid)
    access_name, refresh_name = auth_cookie_names()
    access_token = _cookie_value(res.headers.getlist("Set-Cookie"), access_name)
    refresh_token = _cookie_value(res.headers.getlist("Set-Cookie"), refresh_name)
    assert access_token and refresh_token

    client.set_cookie("localhost", access_name, access_token)
    client.set_cookie("localhost", refresh_name, refresh_token)
    me = client.get("/v1/core/auth/me")
    assert me.status_code == 200
    assert me.get_json()["user"]["id"] == user["id"]


def test_me_accepts_bearer_header(client, app, user, device_uuid):
    """Bearer header remains for tests and internal tooling."""
    from flask_jwt_extended import create_access_token

    with app.app_context():
        token = create_access_token(identity=user["id"], additional_claims={"phone": user["phone"]})
    me = client.get("/v1/core/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.get_json()["user"]["id"] == user["id"]


def test_refresh_rotates_tokens(client, user, device_uuid):
    res = _login(client, user, device_uuid)
    _, refresh_name = auth_cookie_names()
    refresh_cookie = _cookie_value(res.headers.getlist("Set-Cookie"), refresh_name)
    assert refresh_cookie

    client.set_cookie("localhost", refresh_name, refresh_cookie)
    refreshed = client.post(
        "/v1/core/auth/refresh",
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
        "/v1/core/auth/logout",
        headers={"X-Device-UUID": device_uuid},
    )
    assert out.status_code == 200
    cleared = out.headers.getlist("Set-Cookie")
    assert any(f"{access_name}=" in c and "Max-Age=0" in c for c in cleared)

    client.set_cookie("localhost", refresh_name, refresh_cookie)
    again = client.post(
        "/v1/core/auth/refresh",
        headers={"X-Device-UUID": device_uuid},
    )
    assert again.status_code == 403