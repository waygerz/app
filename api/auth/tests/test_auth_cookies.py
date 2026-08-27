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
    # New number → must opt into SMS before the first message (the code) is sent.
    start = client.post(
        "/v1/platform/auth/otp/start", json={"phone": phone_raw, "sms_consent": True}
    )
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
        json={
            "ticket": ticket,
            "display_name": "Newbie",
            "device_uuid": device_uuid,
            "tos_accepted": True,
            "tos_version": "2026-08-01",
            "sms_transactional": True,
            "sms_marketing": False,
        },
    )
    assert done.status_code == 201
    assert done.get_json()["user"]["display_name"] == "Newbie"
    access_name, _ = auth_cookie_names()
    assert any(access_name in c for c in done.headers.getlist("Set-Cookie"))


def test_new_number_requires_sms_consent_before_code(client):
    """A new number gets NO text until it opts in: otp/start without sms_consent
    returns consent_required + is_new and sends no code (no dev_otp)."""
    res = client.post("/v1/platform/auth/otp/start", json={"phone": "9042398490"})
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("consent_required") is True
    assert body.get("is_new") is True
    assert "dev_otp" not in body  # nothing was sent


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
        json={
            "ticket": "not-a-real-ticket",
            "display_name": "X",
            "device_uuid": device_uuid,
            "tos_accepted": True,
        },
    )
    assert res.status_code == 400


def test_complete_requires_consent(client, device_uuid):
    """Signing up without agreeing to the Terms/Privacy is rejected."""
    phone_raw = "9042398486"  # distinct unregistered number
    start = client.post(
        "/v1/platform/auth/otp/start", json={"phone": phone_raw, "sms_consent": True}
    )
    code = start.get_json()["dev_otp"]
    verify = client.post(
        "/v1/platform/auth/otp/verify",
        json={"phone": phone_raw, "otp": code, "device_uuid": device_uuid},
    )
    ticket = verify.get_json()["ticket"]

    res = client.post(
        "/v1/platform/auth/otp/complete",
        json={"ticket": ticket, "display_name": "NoConsent", "device_uuid": device_uuid},
    )
    assert res.status_code == 400


def test_complete_allows_declining_sms(client, device_uuid, monkeypatch):
    """Transactional/marketing SMS are optional: a user can sign up with both
    declined, and declining transactional opts them out in notifications so
    /account doesn't show SMS on (and we don't text a non-consenter)."""
    from app.services import service_auth

    calls: list[tuple[str, bool]] = []
    monkeypatch.setattr(
        service_auth.service_notifications,
        "set_transactional_optin",
        lambda uid, enabled: calls.append(("tx", enabled)),
    )
    monkeypatch.setattr(
        service_auth.service_notifications,
        "set_marketing_optin",
        lambda uid, enabled: calls.append(("mkt", enabled)),
    )

    phone_raw = "9042398487"  # distinct unregistered number
    start = client.post(
        "/v1/platform/auth/otp/start", json={"phone": phone_raw, "sms_consent": True}
    )
    code = start.get_json()["dev_otp"]
    verify = client.post(
        "/v1/platform/auth/otp/verify",
        json={"phone": phone_raw, "otp": code, "device_uuid": device_uuid},
    )
    ticket = verify.get_json()["ticket"]

    res = client.post(
        "/v1/platform/auth/otp/complete",
        json={
            "ticket": ticket,
            "display_name": "OptOut",
            "device_uuid": device_uuid,
            "tos_accepted": True,
            "sms_transactional": False,
            "sms_marketing": False,
        },
    )
    assert res.status_code == 201
    # Transactional decline is synced as an opt-out; marketing (already off by
    # default) needs no sync.
    assert ("tx", False) in calls
    assert not any(kind == "mkt" for kind, _ in calls)


def test_me_accepts_access_cookie(client, user, device_uuid):
    res = _login(client, user, device_uuid)
    access_name, refresh_name = auth_cookie_names()
    access_token = _cookie_value(res.headers.getlist("Set-Cookie"), access_name)
    refresh_token = _cookie_value(res.headers.getlist("Set-Cookie"), refresh_name)
    assert access_token and refresh_token

    client.set_cookie(access_name, access_token)
    client.set_cookie(refresh_name, refresh_token)
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

    client.set_cookie(refresh_name, refresh_cookie)
    refreshed = client.post(
        "/v1/platform/auth/refresh",
        headers={"X-Device-UUID": device_uuid},
    )
    assert refreshed.status_code == 200
    assert "access_token" not in refreshed.get_json()
    assert any(refresh_name in c for c in refreshed.headers.getlist("Set-Cookie"))


def test_mobile_login_returns_body_tokens(client, user, device_uuid):
    """X-Client-Type: mobile → access + refresh tokens in the body, usable as Bearer."""
    start = client.post("/v1/platform/auth/otp/start", json={"phone": user["phone"]})
    code = start.get_json()["dev_otp"]
    res = client.post(
        "/v1/platform/auth/otp/verify",
        json={"phone": user["phone"], "otp": code, "device_uuid": device_uuid},
        headers={"X-Client-Type": "mobile"},
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data.get("access_token") and data.get("refresh_token")
    assert data["user"]["phone"] == user["phone"]

    me = client.get(
        "/v1/platform/auth/me",
        headers={"Authorization": f"Bearer {data['access_token']}"},
    )
    assert me.status_code == 200
    assert me.get_json()["user"]["id"] == user["id"]


def test_mobile_refresh_via_body_rotates(client, user, device_uuid):
    """Native refresh: no cookie — the refresh token comes from the body, and the
    rotated pair is returned in the body."""
    start = client.post("/v1/platform/auth/otp/start", json={"phone": user["phone"]})
    code = start.get_json()["dev_otp"]
    login = client.post(
        "/v1/platform/auth/otp/verify",
        json={"phone": user["phone"], "otp": code, "device_uuid": device_uuid},
        headers={"X-Client-Type": "mobile"},
    ).get_json()
    old_refresh = login["refresh_token"]

    refreshed = client.post(
        "/v1/platform/auth/refresh",
        json={"refresh_token": old_refresh, "device_uuid": device_uuid},
        headers={"X-Client-Type": "mobile"},
    )
    assert refreshed.status_code == 200
    data = refreshed.get_json()
    assert data.get("access_token") and data.get("refresh_token")
    assert data["refresh_token"] != old_refresh  # rotated


def test_logout_clears_session(client, user, device_uuid):
    res = _login(client, user, device_uuid)
    access_name, refresh_name = auth_cookie_names()
    access_token = _cookie_value(res.headers.getlist("Set-Cookie"), access_name)
    refresh_cookie = _cookie_value(res.headers.getlist("Set-Cookie"), refresh_name)
    client.set_cookie(access_name, access_token)
    client.set_cookie(refresh_name, refresh_cookie)

    out = client.post(
        "/v1/platform/auth/logout",
        headers={"X-Device-UUID": device_uuid},
    )
    assert out.status_code == 200
    cleared = out.headers.getlist("Set-Cookie")
    assert any(f"{access_name}=" in c and "Max-Age=0" in c for c in cleared)

    client.set_cookie(refresh_name, refresh_cookie)
    again = client.post(
        "/v1/platform/auth/refresh",
        headers={"X-Device-UUID": device_uuid},
    )
    assert again.status_code == 403
