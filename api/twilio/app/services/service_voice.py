"""Voice TwiML builders — simulring fan-out with voicemail screening.

An incoming call rings every FORWARD_TO phone at once; the first *human* to press
1 is bridged (screening excludes voicemail, which can't press a key). If nobody
connects, a spoken fallback plays instead of dropping the caller into silence.

How we know a human actually connected (for the fallback): the screen records an
"accepted" marker in Redis keyed by the *parent* call SID when someone presses 1,
and /voice/after consumes it. This is authoritative — unlike a DialCallDuration
threshold, which can't tell a 6-second voicemail (that sat through the whisper)
from a short real call. When screening is off, or Redis is unavailable, we fall
back to the dial result (DialCallStatus + duration) as a best-effort signal.

All callback URLs are fully qualified from TWILIO_WEBHOOK_BASE_URL. A bare
`/voice/after` is a path-absolute reference that Twilio (RFC 3986) resolves
against scheme+host only, dropping the /v1/platform/twilio prefix — the callback
would then miss this service entirely. The parent call SID is threaded through the
screen callbacks as a `?call=` query param so both the whisper and its Gather
`action` can correlate to the same call.
"""
from __future__ import annotations

from urllib.parse import quote

from flask import current_app
from twilio.twiml.voice_response import Dial, Gather, VoiceResponse

from app.extensions import get_redis
from app.utils.config import Config

# Whisper = Say (~2-3s) + Gather(timeout=5), so a voicemail leg can stay
# "answered" for up to ~8s. Only used as the Redis-down degrade threshold.
_WHISPER_GRACE_SECS = 9


def _base() -> str:
    return current_app.config["TWILIO_WEBHOOK_BASE_URL"]


def _accept_key(call_sid: str) -> str:
    return f"twilio:accepted:{call_sid}"


def _mark_accepted(call_sid: str | None) -> None:
    """Record that a human pressed 1 on this call. Best-effort: if Redis is down,
    /voice/after degrades to the dial-result heuristic."""
    if not call_sid:
        return
    r = get_redis()
    if r is None:
        return
    try:
        r.setex(_accept_key(call_sid), current_app.config["VOICE_ACCEPT_TTL"], "1")
    except Exception:  # noqa: BLE001
        current_app.logger.exception("voice accept-marker set failed call=%s", call_sid)


def _consume_accepted(call_sid: str | None):
    """True/False if we could authoritatively check the marker; None if we can't
    (no Redis / no call sid) so the caller should fall back to the heuristic."""
    if not call_sid:
        return None
    r = get_redis()
    if r is None:
        return None
    try:
        key = _accept_key(call_sid)
        val = r.get(key)
        if val is not None:
            r.delete(key)
        return val is not None
    except Exception:  # noqa: BLE001
        current_app.logger.exception("voice accept-marker read failed call=%s", call_sid)
        return None


def build_incoming(call_sid: str | None) -> str:
    """TwiML for POST /voice: dial all destinations simultaneously."""
    cfg = current_app.config
    resp = VoiceResponse()
    roster = Config.forward_to()
    if not roster:
        resp.say("Sorry, no one is available right now. Please text us instead.")
        resp.hangup()
        return str(resp)
    dial = Dial(
        timeout=cfg["VOICE_TIMEOUT"],
        answer_on_bridge=True,          # caller hears ringback, not silence
        action=f"{_base()}/voice/after",
        caller_id=cfg["TWILIO_FROM"],   # show the main Waygerz number, not the caller
    )
    screen_url = f"{_base()}/voice/screen"
    if call_sid:                        # correlate the screen callbacks to this call
        screen_url += f"?call={quote(call_sid)}"
    for entry in roster:
        if cfg["VOICE_SCREEN"]:
            dial.number(entry["number"], url=screen_url)  # per-leg press-1 whisper
        else:
            dial.number(entry["number"])
    resp.append(dial)
    return str(resp)


def build_screen(digits: str | None, call_sid: str | None) -> str:
    """TwiML for POST /voice/screen (runs on the answering leg). Self-referential:
    the Gather posts back here (with the same ?call=) carrying Digits. `1` records
    the accept marker and returns an empty Response, which completes the leg's
    TwiML without a hangup so it bridges; anything else hangs up this leg only."""
    resp = VoiceResponse()
    if digits == "1":
        _mark_accepted(call_sid)
        return "<Response/>"            # accepted -> bridge
    if digits:
        resp.hangup()                   # wrong key -> drop this leg
        return str(resp)
    action = f"{_base()}/voice/screen"
    if call_sid:
        action += f"?call={quote(call_sid)}"
    g = Gather(num_digits=1, timeout=5, action=action, method="POST")
    g.say("Waygerz call. Press 1 to accept.")
    resp.append(g)
    resp.hangup()                       # no input (voicemail) -> drop this leg
    return str(resp)


def build_after(call_sid: str | None, dial_status: str | None, dial_duration: str | None) -> str:
    """TwiML for POST /voice/after. A human connected iff the screen recorded an
    accept marker for this call. When screening is off or Redis is unavailable,
    fall back to the dial result: `completed` with a duration past the whisper
    grace (so an all-voicemail call still speaks the fallback)."""
    cfg = current_app.config
    resp = VoiceResponse()

    connected = _consume_accepted(call_sid) if cfg["VOICE_SCREEN"] else None
    if connected is None:
        try:
            bridged = int(dial_duration or 0)
        except (TypeError, ValueError):
            bridged = 0
        grace = _WHISPER_GRACE_SECS if cfg["VOICE_SCREEN"] else 2
        connected = dial_status == "completed" and bridged >= grace

    if not connected:
        resp.say("Sorry, no one is available right now. Please text us instead.")
    resp.hangup()
    return str(resp)
