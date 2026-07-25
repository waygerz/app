"""OTP delivery over SMS.

Sends the login code through Twilio when the provider is configured
(TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM). Until real credentials
are wired in — or while they're left at their dummy placeholders — this falls
back to logging the code, and the API also reveals it on-screen when
AUTH_REVEAL_OTP is set (see service_auth._reveal_otp). Turn AUTH_REVEAL_OTP off
once real SMS delivery is confirmed.
"""
import logging

from app.utils.config import Config

logger = logging.getLogger(__name__)

# Substrings that mark a value as a stand-in rather than a real credential, so
# shipping dummy placeholders keeps delivery in safe log-only mode.
_PLACEHOLDER_MARKERS = ("dummy", "xxxx", "changeme", "placeholder", "replace_me")


def _looks_real(value: str) -> bool:
    v = (value or "").strip()
    if not v:
        return False
    low = v.lower()
    return not any(m in low for m in _PLACEHOLDER_MARKERS)


def provider_configured() -> bool:
    """True only when all three Twilio settings are present and non-placeholder."""
    return (
        _looks_real(Config.TWILIO_ACCOUNT_SID)
        and _looks_real(Config.TWILIO_AUTH_TOKEN)
        and _looks_real(Config.TWILIO_FROM)
    )


def _client():
    # Imported lazily so the twilio dependency is only touched when we actually
    # send — log-only mode never needs it.
    from twilio.rest import Client

    return Client(Config.TWILIO_ACCOUNT_SID, Config.TWILIO_AUTH_TOKEN)


def send_otp(phone: str, code: str) -> None:
    if not provider_configured():
        # No provider (or dummy creds): log only. AUTH_REVEAL_OTP still surfaces
        # the code in the API response for testing.
        logger.info("auth_otp_send (no provider) phone=%s code=%s", phone, code)
        return
    try:
        _client().messages.create(
            to=phone,
            from_=Config.TWILIO_FROM,
            body=f"Your Waygerz verification code is {code}",
        )
        logger.info("auth_otp_send (twilio) phone=%s", phone)
    except Exception:  # noqa: BLE001
        # Never let an SMS hiccup break the login flow. Log it; with
        # AUTH_REVEAL_OTP on the code is still returned for testing.
        logger.exception("auth_otp_send_failed phone=%s", phone)
