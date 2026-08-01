"""Best-effort sync of a new user's opt-in choices to the notifications service.

Auth records consent at signup (a point-in-time compliance record); the *live*
send preferences live in the notifications service. This mirrors a marketing
opt-in there so /account reflects what the user chose at signup and can later
turn it off. Best-effort — never fails signup if notifications is unreachable.
"""
import logging

import requests

from app.utils.config import Config

logger = logging.getLogger(__name__)


def set_marketing_optin(user_id: str, enabled: bool) -> None:
    """Enable/disable the user's promotional (marketing) SMS + in-app opt-in."""
    url = Config.INTERNAL_NOTIFICATIONS_URL
    if not url:
        return
    try:
        resp = requests.post(
            f"{url}/internal/preferences",
            json={
                "user_id": str(user_id),
                "channels": {"marketing": {"sms": enabled, "inapp": enabled}},
            },
            headers={"X-Internal-Token": Config.INTERNAL_TOKEN},
            timeout=10,
        )
        if not resp.ok:
            logger.warning(
                "marketing optin sync %s: %s", resp.status_code, resp.text[:200]
            )
    except Exception:  # noqa: BLE001
        logger.exception("marketing optin sync failed user_id=%s", user_id)
