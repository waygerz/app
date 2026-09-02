"""Inbound SMS fan-out — forward a copy of each text to every FORWARD_TO phone.

Best-effort and bounded: one send per destination, a per-number failure is logged
and skipped (one bad number never drops the rest), the whole thing stays under
Twilio's ~15s webhook deadline via the FORWARD_MAX cap, and a per-sender Redis
rate limit caps cost/abuse (each inbound = N outbound).

Staff replies (From ∈ FORWARD_TO) are treated as a group message: broadcast to
the *other* members, never echoed back to the sender.
"""
from __future__ import annotations

from flask import current_app
from twilio.twiml.messaging_response import MessagingResponse

from app.extensions import get_redis
from app.utils.config import Config, normalize_e164

_EMPTY_TWIML = str(MessagingResponse())  # "<Response></Response>"


def _label(number: str, roster: list[dict]) -> str:
    for e in roster:
        if e["number"] == number and e.get("name"):
            return e["name"]
    return number


def _rate_limited(sender: str) -> bool:
    """Per-sender fixed-window counter in Redis. Fails open if Redis is down —
    a forwarding line shouldn't go dark because the rate limiter is unavailable."""
    cfg = current_app.config
    r = get_redis()
    if r is None:
        return False
    key = f"twilio:rl:{sender}"
    try:
        n = r.incr(key)
        # Re-apply the TTL every hit with NX (no-op if one already exists). If the
        # initial expire ever failed, this heals it — otherwise the key could live
        # forever and permanently rate-limit the sender.
        r.expire(key, cfg["RATE_LIMIT_WINDOW"], nx=True)
        return n > cfg["RATE_LIMIT_MAX"]
    except Exception:  # noqa: BLE001 - never let the limiter break forwarding
        current_app.logger.exception("rate-limit check failed sender=%s", sender)
        return False


def _twilio_client():
    from twilio.rest import Client  # lazy so tests can patch without real creds
    cfg = current_app.config
    return Client(cfg["TWILIO_ACCOUNT_SID"], cfg["TWILIO_AUTH_TOKEN"])


def handle_inbound(form) -> str:
    """Process a POST /sms webhook payload (a form-like mapping). Returns TwiML."""
    cfg = current_app.config
    sender = normalize_e164(form.get("From", ""))
    body = form.get("Body", "") or ""
    try:
        num_media = int(form.get("NumMedia", "0") or 0)
    except (TypeError, ValueError):
        num_media = 0
    if num_media > 0:
        body = (body + " [media omitted]").strip()

    roster = Config.forward_to_sms()
    # Group behavior: a reply from a roster number goes to the *others*, not back
    # to the sender (no self-echo).
    destinations = [e for e in roster if e["number"] != sender][: cfg["FORWARD_MAX"]]

    if not destinations:
        return _EMPTY_TWIML

    if _rate_limited(sender):
        current_app.logger.warning("twilio inbound rate-limited sender=%s", sender)
        return _EMPTY_TWIML

    prefix = _label(sender, roster)
    out_body = f"From {prefix}: {body}".strip() if body else f"From {prefix}: [no text]"
    client = _twilio_client()

    sent, failures = 0, 0
    for entry in destinations:
        try:
            client.messages.create(
                to=entry["number"], from_=cfg["FORWARD_FROM"], body=out_body
            )
            sent += 1
        except Exception:  # noqa: BLE001 - best-effort; one bad number != drop all
            failures += 1
            current_app.logger.exception("forward failed to=%s", entry["number"])

    current_app.logger.info(
        "twilio inbound sms from=%s num_forwarded=%s failures=%s media=%s",
        sender, sent, failures, num_media,
    )
    return _EMPTY_TWIML
