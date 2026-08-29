"""Twilio webhook behavior: signature guard, voice simulring + screening, SMS
fan-out. All webhook responses are TwiML (text/xml)."""
from twilio.request_validator import RequestValidator

PREFIX = "/v1/platform/twilio"


# --- health + signature guard ------------------------------------------------

def test_health_open_no_signature(client):
    res = client.get(f"{PREFIX}/health")
    assert res.status_code == 200
    assert res.get_json()["service"] == "twilio"


def test_unsigned_webhook_rejected_when_validation_on(app, client):
    app.config["TWILIO_VALIDATE_SIGNATURE"] = True
    res = client.post(f"{PREFIX}/voice", data={"From": "+15559998888"})
    assert res.status_code == 403


def test_valid_signature_accepted(app, client):
    app.config["TWILIO_VALIDATE_SIGNATURE"] = True
    params = {"From": "+15559998888", "To": "+18335885058"}
    url = f"{app.config['TWILIO_WEBHOOK_BASE_URL']}/voice"
    sig = RequestValidator(app.config["TWILIO_AUTH_TOKEN"]).compute_signature(url, params)
    res = client.post(f"{PREFIX}/voice", data=params, headers={"X-Twilio-Signature": sig})
    assert res.status_code == 200
    assert res.mimetype == "text/xml"


def test_tampered_signature_rejected(app, client):
    app.config["TWILIO_VALIDATE_SIGNATURE"] = True
    params = {"From": "+15559998888"}
    res = client.post(
        f"{PREFIX}/voice", data=params, headers={"X-Twilio-Signature": "bogus"}
    )
    assert res.status_code == 403


# --- voice: simulring + screening --------------------------------------------

def test_voice_dials_all_screened(client):
    res = client.post(f"{PREFIX}/voice", data={"From": "+15559998888"})
    assert res.status_code == 200 and res.mimetype == "text/xml"
    body = res.get_data(as_text=True)
    assert "<Dial" in body and 'answerOnBridge="true"' in body
    assert 'callerId="+18335885058"' in body
    # both destinations, each screened, callbacks fully qualified
    assert "+15551110001" in body and "+15551110002" in body
    assert "https://test.example/v1/platform/twilio/voice/screen" in body
    assert 'action="https://test.example/v1/platform/twilio/voice/after"' in body


def test_voice_incoming_logs_simulring(client, caplog):
    # the dial logging must actually emit at INFO (Flask defaults to WARNING) so
    # the per-call line shows up in CloudWatch — guard against that regressing.
    import logging
    with caplog.at_level(logging.INFO):
        client.post(f"{PREFIX}/voice", data={"From": "+15559998888", "CallSid": "CA1"})
    line = next((r.message for r in caplog.records if "voice incoming" in r.message), "")
    assert "simulring" in line and "CA1" in line
    assert "+15559998888" not in line  # caller is masked, not written in full


def test_voice_no_screen_when_disabled(app, client):
    app.config["VOICE_SCREEN"] = False
    body = client.post(f"{PREFIX}/voice", data={"From": "+1"}).get_data(as_text=True)
    assert "voice/screen" not in body
    assert "+15551110001" in body


def test_voice_screen_accept_bridges(client):
    body = client.post(f"{PREFIX}/voice/screen", data={"Digits": "1"}).get_data(as_text=True)
    assert body.strip() == "<Response/>"          # empty -> bridge, no hangup


def test_voice_screen_wrong_key_hangs_up(client):
    body = client.post(f"{PREFIX}/voice/screen", data={"Digits": "9"}).get_data(as_text=True)
    assert "<Hangup" in body and "<Gather" not in body


def test_voice_screen_no_input_prompts_then_hangs_up(client):
    body = client.post(f"{PREFIX}/voice/screen", data={}).get_data(as_text=True)
    assert "<Gather" in body and "Press 1" in body and "<Hangup" in body
    assert 'action="https://test.example/v1/platform/twilio/voice/screen"' in body


def test_voice_threads_call_sid_into_screen_url(client):
    body = client.post(f"{PREFIX}/voice", data={"From": "+1", "CallSid": "CA123"}).get_data(as_text=True)
    assert "voice/screen?call=CA123" in body


def test_voice_accept_marker_end_to_end(client, voice_redis):
    # human presses 1 with the parent call threaded -> marker set -> after: no fallback
    client.post(f"{PREFIX}/voice/screen?call=CA123", data={"Digits": "1"})
    assert voice_redis.get("twilio:accepted:CA123") == "1"
    body = client.post(
        f"{PREFIX}/voice/after",
        data={"CallSid": "CA123", "DialCallStatus": "completed", "DialCallDuration": "3"},
    ).get_data(as_text=True)
    assert "no one is available" not in body        # authoritative marker wins over short duration
    assert voice_redis.get("twilio:accepted:CA123") is None  # consumed


def test_voice_after_no_marker_speaks_fallback(client, voice_redis):
    # nobody accepted (no marker) -> fallback even if the leg reported completed
    body = client.post(
        f"{PREFIX}/voice/after",
        data={"CallSid": "CA999", "DialCallStatus": "completed", "DialCallDuration": "7"},
    ).get_data(as_text=True)
    assert "no one is available" in body


def test_voice_after_degrades_to_duration_without_redis(client):
    # no Redis (client fixture -> get_redis returns a real client that errors, or
    # here call has no marker path): with screening on, fall back to the duration
    # heuristic past the whisper grace.
    long_call = client.post(
        f"{PREFIX}/voice/after",
        data={"DialCallStatus": "completed", "DialCallDuration": "42"},
    ).get_data(as_text=True)
    assert "no one is available" not in long_call
    short_call = client.post(
        f"{PREFIX}/voice/after",
        data={"DialCallStatus": "completed", "DialCallDuration": "0"},
    ).get_data(as_text=True)
    assert "no one is available" in short_call


def test_voice_after_noanswer_speaks_fallback(client):
    body = client.post(
        f"{PREFIX}/voice/after", data={"DialCallStatus": "no-answer"}
    ).get_data(as_text=True)
    assert "no one is available" in body


# --- sms: fan-out ------------------------------------------------------------

def test_sms_fans_out_to_all(client, no_redis, sent_messages):
    res = client.post(f"{PREFIX}/sms", data={"From": "+15559998888", "Body": "hi team"})
    assert res.status_code == 200 and res.mimetype == "text/xml"
    tos = {m["to"] for m in sent_messages}
    assert tos == {"+15551110001", "+15551110002"}
    assert all(m["from_"] == "+18335885058" for m in sent_messages)
    assert all(m["body"] == "From +15559998888: hi team" for m in sent_messages)


def test_sms_staff_reply_excludes_sender_and_labels(client, no_redis, sent_messages):
    # Sam (in roster) replies -> goes to the *other* member only, prefixed by name
    client.post(f"{PREFIX}/sms", data={"From": "+15551110001", "Body": "on it"})
    tos = {m["to"] for m in sent_messages}
    assert tos == {"+15551110002"}
    assert sent_messages[0]["body"] == "From Sam: on it"


def test_sms_media_omitted_marker(client, no_redis, sent_messages):
    client.post(f"{PREFIX}/sms", data={"From": "+15559998888", "Body": "", "NumMedia": "1"})
    assert sent_messages[0]["body"] == "From +15559998888: [media omitted]"


def test_sms_rate_limited_sends_nothing(app, client, fake_redis, sent_messages):
    app.config["RATE_LIMIT_MAX"] = 2
    for _ in range(3):
        client.post(f"{PREFIX}/sms", data={"From": "+15559998888", "Body": "spam"})
    # 2 allowed inbound × 2 destinations = 4; the 3rd inbound is dropped
    assert len(sent_messages) == 4


def test_sms_self_number_not_a_destination(client, no_redis, sent_messages):
    # the main line is excluded from the roster, so texting from it fans to others
    client.post(f"{PREFIX}/sms", data={"From": "+18335885058", "Body": "test"})
    tos = {m["to"] for m in sent_messages}
    assert "+18335885058" not in tos
