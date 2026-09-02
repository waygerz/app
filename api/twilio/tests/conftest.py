"""Test fixtures for the twilio service.

Env is set BEFORE importing the app so the import-time Config statics
(TWILIO_FROM, base URL, token) are captured. Signature validation defaults OFF
for behavior tests; the guard reads `current_app.config` at request time, so a
signature test just flips `app.config["TWILIO_VALIDATE_SIGNATURE"] = True`.
"""
import json
import os

os.environ.setdefault("SERVICE_GROUP", "platform")
os.environ.setdefault("SERVICE_NAME", "twilio")
os.environ["TWILIO_FROM"] = "+18335885058"
os.environ["TWILIO_ACCOUNT_SID"] = "ACtest0000000000000000000000000000"
os.environ["TWILIO_AUTH_TOKEN"] = "test_auth_token"
os.environ["TWILIO_WEBHOOK_BASE_URL"] = "https://test.example/v1/platform/twilio"
os.environ["TWILIO_VALIDATE_SIGNATURE"] = "false"
os.environ["FORWARD_TO"] = json.dumps(
    [{"number": "+15551110001", "name": "Sam"}, {"number": "+15551110002"}]
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

import pytest  # noqa: E402

from app import create_app  # noqa: E402


@pytest.fixture()
def app():
    application = create_app()
    application.testing = True
    return application


@pytest.fixture()
def client(app):
    return app.test_client()


class FakeRedis:
    """Minimal in-memory stand-in for the rate-limit counter + accept markers."""

    def __init__(self):
        self.store = {}

    def incr(self, key):
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]

    def expire(self, key, ttl, nx=False):
        return True

    def setex(self, key, ttl, val):
        self.store[key] = val
        return True

    def set(self, key, val, nx=False, ex=None):
        if nx and key in self.store:
            return None
        self.store[key] = val
        return True

    def get(self, key):
        return self.store.get(key)

    def delete(self, key):
        return self.store.pop(key, None) is not None


@pytest.fixture()
def no_redis(monkeypatch):
    """Most SMS tests don't exercise the limiter — return None so it fails open
    without touching a real Redis."""
    monkeypatch.setattr("app.services.service_sms.get_redis", lambda: None)


@pytest.fixture()
def fake_redis(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr("app.services.service_sms.get_redis", lambda: fake)
    return fake


@pytest.fixture()
def notify_no_redis(monkeypatch):
    """Notify auto-reply with no Redis — the dedupe guard fails open (replies)."""
    monkeypatch.setattr("app.services.service_notify.get_redis", lambda: None)


@pytest.fixture()
def notify_redis(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr("app.services.service_notify.get_redis", lambda: fake)
    return fake


@pytest.fixture()
def voice_redis(monkeypatch):
    """Back the voice accept-marker with an in-memory store."""
    fake = FakeRedis()
    monkeypatch.setattr("app.services.service_voice.get_redis", lambda: fake)
    return fake


@pytest.fixture()
def sent_messages(monkeypatch):
    """Capture Twilio REST sends instead of hitting the API."""
    sent = []

    class _Msgs:
        def create(self, to, from_, body):
            sent.append({"to": to, "from_": from_, "body": body})
            return type("M", (), {"sid": "SMtest"})()

    class _Client:
        messages = _Msgs()

    monkeypatch.setattr("app.services.service_sms._twilio_client", lambda: _Client())
    return sent
