"""OTP delivery.

No SMS provider is wired yet. `send_otp` logs the code, and the API also reveals it
on-screen when AUTH_REVEAL_OTP is set (see service_auth._reveal_otp). Replace the body
of send_otp with a real provider (Twilio / AWS SNS) before real launch, and turn off
AUTH_REVEAL_OTP.
"""
import logging

logger = logging.getLogger(__name__)


def send_otp(phone: str, code: str) -> None:
    logger.info("auth_otp_send phone=%s code=%s", phone, code)
