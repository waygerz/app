"""OTP SMS delivery (Twilio) — configuration gate + send path.

These don't need the twilio package installed or a real account: the client
builder is monkeypatched, so only the log-only path ever imports twilio.
"""
import logging

from app.services import service_sms
from app.utils.config import Config


def _set(monkeypatch, sid, token, frm):
    monkeypatch.setattr(Config, "TWILIO_ACCOUNT_SID", sid)
    monkeypatch.setattr(Config, "TWILIO_AUTH_TOKEN", token)
    monkeypatch.setattr(Config, "TWILIO_FROM", frm)


def test_not_configured_when_empty(monkeypatch):
    _set(monkeypatch, "", "", "")
    assert service_sms.provider_configured() is False


def test_not_configured_with_dummy_placeholders(monkeypatch):
    # The values docker-compose ships must NOT count as configured.
    _set(monkeypatch, "ACdummy00000000000000000000000000", "dummy_auth_token_replace_me", "+15555550100")
    assert service_sms.provider_configured() is False


def test_configured_with_real_looking_values(monkeypatch):
    _set(monkeypatch, "AC" + "a" * 32, "a_real_looking_token", "+15551234567")
    assert service_sms.provider_configured() is True


def test_send_logs_and_skips_twilio_when_unconfigured(monkeypatch, caplog):
    _set(monkeypatch, "", "", "")

    def _boom():
        raise AssertionError("must not build a Twilio client when unconfigured")

    monkeypatch.setattr(service_sms, "_client", _boom)
    with caplog.at_level(logging.INFO):
        service_sms.send_otp("+15551112222", "123456")
    assert "no provider" in caplog.text


def test_send_calls_twilio_when_configured(monkeypatch):
    _set(monkeypatch, "AC" + "a" * 32, "token", "+15551234567")
    sent = {}

    class FakeMessages:
        def create(self, to, from_, body):
            sent.update(to=to, from_=from_, body=body)

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr(service_sms, "_client", lambda: FakeClient())
    service_sms.send_otp("+15551112222", "123456")
    assert sent["to"] == "+15551112222"
    assert sent["from_"] == "+15551234567"
    assert "123456" in sent["body"]


def test_send_swallows_provider_errors(monkeypatch, caplog):
    # A Twilio failure must not bubble up and break the login flow.
    _set(monkeypatch, "AC" + "a" * 32, "token", "+15551234567")

    class FakeMessages:
        def create(self, **_):
            raise RuntimeError("twilio down")

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr(service_sms, "_client", lambda: FakeClient())
    with caplog.at_level(logging.ERROR):
        service_sms.send_otp("+15551112222", "123456")  # must not raise
    assert "auth_otp_send_failed" in caplog.text
