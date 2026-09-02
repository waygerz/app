"""Voice vs SMS roster split (FORWARD_TO_VOICE / FORWARD_TO_SMS overrides).

The rosters are read from os.environ at call time, so these monkeypatch the env
directly and call the Config classmethods — no app context needed.
"""
import json

from app.utils.config import Config


def _nums(roster):
    return [e["number"] for e in roster]


def test_both_channels_fall_back_to_shared_forward_to(monkeypatch):
    monkeypatch.setenv("FORWARD_TO", json.dumps([{"number": "+15551110001"}]))
    monkeypatch.delenv("FORWARD_TO_VOICE", raising=False)
    monkeypatch.delenv("FORWARD_TO_SMS", raising=False)
    assert _nums(Config.forward_to_voice()) == ["+15551110001"]
    assert _nums(Config.forward_to_sms()) == ["+15551110001"]


def test_voice_override_only_affects_voice(monkeypatch):
    monkeypatch.setenv("FORWARD_TO", json.dumps([{"number": "+15551110001"}]))
    monkeypatch.setenv("FORWARD_TO_VOICE", json.dumps([{"number": "+15552220002"}]))
    monkeypatch.delenv("FORWARD_TO_SMS", raising=False)
    assert _nums(Config.forward_to_voice()) == ["+15552220002"]
    assert _nums(Config.forward_to_sms()) == ["+15551110001"]  # still shared


def test_sms_override_only_affects_sms(monkeypatch):
    monkeypatch.setenv("FORWARD_TO", json.dumps([{"number": "+15551110001"}]))
    monkeypatch.setenv("FORWARD_TO_SMS", json.dumps([{"number": "+15553330003"}]))
    monkeypatch.delenv("FORWARD_TO_VOICE", raising=False)
    assert _nums(Config.forward_to_sms()) == ["+15553330003"]
    assert _nums(Config.forward_to_voice()) == ["+15551110001"]  # still shared


def test_channels_fully_independent(monkeypatch):
    monkeypatch.setenv("FORWARD_TO", "")
    monkeypatch.setenv("FORWARD_TO_VOICE", json.dumps([{"number": "+15552220002", "name": "Call Me"}]))
    monkeypatch.setenv("FORWARD_TO_SMS", "+15553330003, +15554440004")
    assert _nums(Config.forward_to_voice()) == ["+15552220002"]
    assert _nums(Config.forward_to_sms()) == ["+15553330003", "+15554440004"]


def test_empty_override_string_falls_back(monkeypatch):
    # A blank SSM param (empty string) must NOT read as an empty roster — it
    # should fall back to the shared FORWARD_TO, same as unset.
    monkeypatch.setenv("FORWARD_TO", json.dumps([{"number": "+15551110001"}]))
    monkeypatch.setenv("FORWARD_TO_VOICE", "   ")
    assert _nums(Config.forward_to_voice()) == ["+15551110001"]
