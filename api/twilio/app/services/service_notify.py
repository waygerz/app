"""Auto-attendant for the notifications line (TWILIO_FROM, e.g. 588-5058).

That number is an outbound-only sender (OTP + alerts). Inbound traffic to it is
NOT forwarded — a call hears a short announcement and hangs up, a text gets a
one-line auto-reply, both pointing the person at the human help line
(FORWARD_FROM / SUPPORT_NUMBER, e.g. 588-8330). Pure TwiML: the reply/answer goes
out from whichever number Twilio was hit on, so no from-identity is needed here.
"""
from __future__ import annotations

import re

from flask import current_app
from twilio.twiml.messaging_response import MessagingResponse
from twilio.twiml.voice_response import VoiceResponse

from app.extensions import get_redis
from app.utils.config import normalize_e164

_DIGITS = re.compile(r"\d")

# Standard carrier opt-out / opt-in / help keywords. We must NOT answer these
# with a marketing-style "call our help line" reply — a STOP has to be honored,
# not talked over. When Twilio Advanced Opt-Out is on it intercepts these before
# our webhook; this is the belt-and-suspenders so we're compliant either way.
_KEYWORDS = {
    "STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT",  # opt-out
    "START", "YES", "UNSTOP",                                    # opt-in
    "HELP", "INFO",                                              # help
}


def _is_keyword(body: str) -> bool:
    """True if the (whole) message is a single standard keyword — case/space
    insensitive. Only a lone keyword counts, so 'help me place a bet' still gets
    the auto-reply."""
    return body.strip().upper() in _KEYWORDS


def _already_replied(sender: str) -> bool:
    """Reply at most once per sender per RATE_LIMIT_WINDOW so two auto-responders
    can't ping-pong and a spammer can't draw a billed reply per text. Fails open
    (allows the reply) if Redis is down — matches the fan-out limiter's stance."""
    if not sender:
        return False
    r = get_redis()
    if r is None:
        return False
    key = f"twilio:notify:replied:{sender}"
    try:
        # SET NX: first hit stores the marker and returns truthy; subsequent hits
        # within the TTL find it already set.
        won = r.set(key, "1", nx=True, ex=current_app.config["RATE_LIMIT_WINDOW"])
        return not won
    except Exception:  # noqa: BLE001 - never let the guard break the reply path
        current_app.logger.exception("notify reply-dedupe check failed sender=%s", sender)
        return False


def _support_display() -> str:
    """Human-readable help number for the SMS reply. Uses SUPPORT_NUMBER verbatim
    if set, else formats FORWARD_FROM as (AAA) BBB-CCCC (falls back to the raw
    value if it isn't a 10-digit NANP number)."""
    cfg = current_app.config
    if cfg.get("SUPPORT_NUMBER"):
        return cfg["SUPPORT_NUMBER"]
    d = "".join(_DIGITS.findall(cfg.get("FORWARD_FROM") or ""))
    if len(d) == 11 and d.startswith("1"):
        d = d[1:]
    if len(d) == 10:
        return f"({d[:3]}) {d[3:6]}-{d[6:]}"
    return cfg.get("FORWARD_FROM") or ""


def _support_spoken() -> str:
    """The help number as space-separated digits so <Say> reads it clearly
    ('8 3 3 5 8 8 8 3 3 0') rather than as a mangled cardinal number."""
    cfg = current_app.config
    source = cfg["SUPPORT_NUMBER"] if cfg.get("SUPPORT_NUMBER") else (cfg.get("FORWARD_FROM") or "")
    d = "".join(_DIGITS.findall(source))
    if len(d) == 11 and d.startswith("1"):
        d = d[1:]
    return " ".join(d)


def announce_voice() -> str:
    """TwiML for POST /notify/voice: speak the help number and hang up."""
    resp = VoiceResponse()
    spoken = _support_spoken()
    if spoken:
        resp.say(
            "You've reached the Waygerz automated notifications line, which is "
            f"not monitored. For help, please call {spoken}. Thank you."
        )
    else:  # no help number configured — don't leave dead air
        resp.say(
            "You've reached the Waygerz automated notifications line, which is "
            "not monitored. Please use the app for help. Thank you."
        )
    resp.hangup()
    current_app.logger.info("notify voice announcement served support=%s", spoken or "unset")
    return str(resp)


def announce_sms(form) -> str:
    """TwiML for POST /notify/sms: one-line auto-reply pointing at the help line.
    Reply goes out from the notifications number Twilio was texted on."""
    resp = MessagingResponse()  # empty = "<Response></Response>", i.e. no reply
    sender = normalize_e164(form.get("From", "")) if form else ""
    body = (form.get("Body", "") or "") if form else ""

    # Never talk over an opt-out/opt-in/help keyword; let carrier/Twilio handle it.
    if _is_keyword(body):
        current_app.logger.info("notify sms keyword=%s from=%s -> no reply", body.strip().upper(), sender or "?")
        return str(resp)
    # One auto-reply per sender per window (loop/abuse guard).
    if _already_replied(sender):
        current_app.logger.info("notify sms from=%s -> already replied this window, suppressing", sender or "?")
        return str(resp)

    display = _support_display()
    if display:
        resp.message(
            "This is an automated Waygerz notifications number that isn't "
            f"monitored. For help, please call or text {display}."
        )
    else:
        resp.message(
            "This is an automated Waygerz notifications number that isn't "
            "monitored. Please use the app for help."
        )
    current_app.logger.info("notify sms auto-reply served to=%s support=%s", sender or "?", display or "unset")
    return str(resp)
