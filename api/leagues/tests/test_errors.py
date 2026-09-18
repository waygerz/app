"""The shared error contract (app/utils/errors.py): every error is JSON
`{error, error_code}`, and every auth failure is a 401 (never the JWT library's
422 / `{msg}`), so web and mobile both refresh or sign out the same way."""
import datetime

from flask_jwt_extended import create_access_token

from tests.conftest import API_PREFIX


def _assert_error(r, status, code):
    assert r.status_code == status
    body = r.get_json()
    assert body["error_code"] == code and isinstance(body["error"], str) and body["error"]
    assert "msg" not in body


def test_unknown_route_is_json_404(client):
    _assert_error(client.get(f"{API_PREFIX}/no/such/route"), 404, "not_found")


def test_wrong_method_is_json_405_with_allow(client):
    r = client.delete(f"{API_PREFIX}/invites")
    _assert_error(r, 405, "method_not_allowed")
    assert "GET" in r.headers["Allow"]


def test_missing_token_is_401(client):
    _assert_error(client.get(f"{API_PREFIX}/"), 401, "unauthorized")


def test_malformed_token_is_401_not_422(client):
    r = client.get(f"{API_PREFIX}/", headers={"Authorization": "Bearer not.a.jwt"})
    _assert_error(r, 401, "invalid_token")


def test_expired_token_is_401(client, app):
    with app.app_context():
        token = create_access_token(identity="u1", expires_delta=datetime.timedelta(seconds=-1))
    r = client.get(f"{API_PREFIX}/", headers={"Authorization": f"Bearer {token}"})
    _assert_error(r, 401, "token_expired")
