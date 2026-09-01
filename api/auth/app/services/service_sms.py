"""OTP delivery.

Auth doesn't talk to an SMS provider directly — it hands the code to the
notifications service, which renders the `otp_code` template and sends it via
whatever provider is configured there (log / AWS / Twilio). This keeps a single
SMS path and one place to manage templates, providers, and compliance.

If the notifications call fails for any reason (service down, template not
seeded, network) we log the failure so it can be diagnosed. The code itself is
never returned to the client — it's an SMS-only secret — and is logged only
outside production (where the log-provider path is how a developer reads it).
"""
import logging

import requests
from flask import current_app

from app.utils.config import Config

logger = logging.getLogger(__name__)


def send_otp(phone: str, code: str) -> bool:
    """Deliver the OTP via notifications. Returns True if the recipient has opted
    out of SMS (texted STOP) — the same toll-free number sends codes, so a STOP
    blocks login codes too, and the caller must tell the user to text START."""
    url = Config.INTERNAL_NOTIFICATIONS_URL
    if url:
        try:
            resp = requests.post(
                f"{url}/internal/send",
                json={
                    "to": phone,
                    "category": "otp",
                    "template_key": "otp_code",
                    "context": {"code": code},
                },
                headers={"X-Internal-Token": Config.INTERNAL_TOKEN},
                timeout=10,
            )
            if resp.ok:
                body = resp.json() if resp.content else {}
                if body.get("opted_out"):
                    logger.info("auth_otp_send opted_out phone=%s", phone)
                    return True
                logger.info("auth_otp_send (notifications) phone=%s", phone)
                return False
            logger.warning(
                "auth_otp_send notifications %s: %s", resp.status_code, resp.text[:200]
            )
        except Exception:  # noqa: BLE001
            logger.exception("auth_otp_send notifications call failed phone=%s", phone)
    # Fallback: no notifications URL configured, or the call failed. Outside
    # production, log the code so a developer can still complete login; in
    # production never log the secret — just record that delivery failed.
    if current_app.config.get("APP_ENV") != "production":
        logger.info("auth_otp_send (fallback log) phone=%s code=%s", phone, code)
    else:
        logger.warning("auth_otp_send (fallback, undelivered) phone=%s", phone)
    return False
