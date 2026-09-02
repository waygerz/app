"""Notifications-line auto-attendant (/notify/voice, /notify/sms) + FORWARD_FROM.

The notifications number isn't forwarded: a call hears an announcement, a text
gets an auto-reply, both pointing at the help line. Signature validation is off
in tests (see conftest), so these POST the webhooks directly.
"""


def test_notify_voice_announces_and_hangs_up(client):
    r = client.post("/v1/platform/twilio/notify/voice", data={"From": "+15551230000"})
    assert r.status_code == 200
    body = r.get_data(as_text=True)
    assert "<Say" in body and "<Hangup" in body
    assert "<Dial" not in body  # never simulrings the roster
    assert "not monitored" in body


def test_notify_sms_auto_replies_without_fanout(client, notify_no_redis, sent_messages):
    r = client.post("/v1/platform/twilio/notify/sms", data={"From": "+15551230000", "Body": "hi"})
    assert r.status_code == 200
    body = r.get_data(as_text=True)
    assert "<Message" in body
    assert sent_messages == []  # TwiML reply only; no REST fan-out


def test_notify_voice_speaks_support_number(app, client):
    app.config["SUPPORT_NUMBER"] = ""
    app.config["FORWARD_FROM"] = "+18335888330"
    r = client.post("/v1/platform/twilio/notify/voice", data={})
    body = r.get_data(as_text=True)
    assert "8 3 3 5 8 8 8 3 3 0" in body  # spoken digit-by-digit


def test_notify_sms_uses_support_display_override(app, client, notify_no_redis):
    app.config["SUPPORT_NUMBER"] = "(833) 588-8330"
    r = client.post("/v1/platform/twilio/notify/sms", data={"From": "+15551230000"})
    assert "(833) 588-8330" in r.get_data(as_text=True)


def test_notify_sms_stop_keyword_gets_no_reply(client, notify_no_redis):
    # A lone opt-out keyword must not draw a marketing-style reply.
    r = client.post("/v1/platform/twilio/notify/sms", data={"From": "+15551230000", "Body": " stop "})
    assert r.get_data(as_text=True).strip() in ("<Response></Response>", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>")


def test_notify_sms_keyword_in_sentence_still_replies(client, notify_no_redis):
    # Only a *lone* keyword is suppressed; a real question still gets help info.
    r = client.post("/v1/platform/twilio/notify/sms", data={"From": "+15551230000", "Body": "help me bet"})
    assert "<Message" in r.get_data(as_text=True)


def test_notify_sms_replies_once_per_window(client, notify_redis):
    data = {"From": "+15551230000", "Body": "hi"}
    first = client.post("/v1/platform/twilio/notify/sms", data=data).get_data(as_text=True)
    second = client.post("/v1/platform/twilio/notify/sms", data=data).get_data(as_text=True)
    assert "<Message" in first          # first reply goes out
    assert "<Message" not in second     # second within the window is suppressed


def test_forward_from_is_caller_id_on_simulring(app, client):
    app.config["FORWARD_FROM"] = "+18335888330"
    r = client.post("/v1/platform/twilio/voice", data={"From": "+15551230000", "CallSid": "CA1"})
    body = r.get_data(as_text=True)
    assert 'callerId="+18335888330"' in body  # help line, not TWILIO_FROM


def test_forward_from_is_sms_from(app, client, no_redis, sent_messages):
    app.config["FORWARD_FROM"] = "+18335888330"
    client.post("/v1/platform/twilio/sms", data={"From": "+15559990000", "Body": "yo"})
    assert sent_messages, "expected a fan-out send"
    assert all(m["from_"] == "+18335888330" for m in sent_messages)
