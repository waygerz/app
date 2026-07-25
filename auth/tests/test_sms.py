"""OTP delivery: auth hands the code to the notifications service, and always
falls back to logging so the login flow can't be broken by a delivery failure.

No network here — requests.post is monkeypatched.
"""
import logging

from app.services import service_sms
from app.utils.config import Config

_URL = "http://notifications:8000/v1/platform/notifications"


class _Resp:
    def __init__(self, ok, status_code=200, text=""):
        self.ok = ok
        self.status_code = status_code
        self.text = text


def test_send_posts_to_notifications(monkeypatch):
    monkeypatch.setattr(Config, "INTERNAL_NOTIFICATIONS_URL", _URL)
    calls = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.update(url=url, json=json, headers=headers)
        return _Resp(True)

    monkeypatch.setattr(service_sms.requests, "post", fake_post)
    service_sms.send_otp("+15551112222", "123456")
    assert calls["url"] == f"{_URL}/internal/send"
    assert calls["json"] == {
        "to": "+15551112222",
        "category": "otp",
        "template_key": "otp_code",
        "context": {"code": "123456"},
    }
    assert "X-Internal-Token" in calls["headers"]


def test_falls_back_to_log_on_http_error(monkeypatch, caplog):
    monkeypatch.setattr(Config, "INTERNAL_NOTIFICATIONS_URL", _URL)
    monkeypatch.setattr(service_sms.requests, "post", lambda *a, **k: _Resp(False, 502, "boom"))
    with caplog.at_level(logging.INFO):
        service_sms.send_otp("+15551112222", "000000")
    assert "fallback log" in caplog.text


def test_falls_back_when_call_raises(monkeypatch, caplog):
    monkeypatch.setattr(Config, "INTERNAL_NOTIFICATIONS_URL", _URL)

    def boom(*a, **k):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(service_sms.requests, "post", boom)
    with caplog.at_level(logging.INFO):
        service_sms.send_otp("+15551112222", "000000")
    assert "fallback log" in caplog.text


def test_logs_and_skips_post_when_no_url(monkeypatch, caplog):
    monkeypatch.setattr(Config, "INTERNAL_NOTIFICATIONS_URL", "")

    def boom(*a, **k):
        raise AssertionError("must not POST when no notifications URL is set")

    monkeypatch.setattr(service_sms.requests, "post", boom)
    with caplog.at_level(logging.INFO):
        service_sms.send_otp("+15551112222", "000000")
    assert "fallback log" in caplog.text
