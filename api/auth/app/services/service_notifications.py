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


def _sync_prefs(user_id: str, payload: dict, label: str) -> None:
    """POST a partial preference patch to the notifications service. Best-effort:
    logs and swallows failures so a signup never fails on this sync."""
    url = Config.INTERNAL_NOTIFICATIONS_URL
    if not url:
        return
    try:
        resp = requests.post(
            f"{url}/internal/preferences",
            json={"user_id": str(user_id), **payload},
            headers={"X-Internal-Token": Config.INTERNAL_TOKEN},
            timeout=10,
        )
        if not resp.ok:
            logger.warning("%s sync %s: %s", label, resp.status_code, resp.text[:200])
    except Exception:  # noqa: BLE001
        logger.exception("%s sync failed user_id=%s", label, user_id)


def set_marketing_optin(user_id: str, enabled: bool) -> None:
    """Enable/disable the user's promotional (marketing) SMS + in-app opt-in."""
    _sync_prefs(
        user_id,
        {"channels": {"marketing": {"sms": enabled, "inapp": enabled}}},
        "marketing optin",
    )


def set_transactional_optin(user_id: str, enabled: bool) -> None:
    """Mirror the signup transactional-SMS choice onto the notifications master.

    Transactional app-notification SMS defaults ON in the notifications service,
    so a user who *declines* it at signup must be opted out here or /account would
    show "Allow SMS for Notifications" on — and we'd text them without consent.
    `opted_out` is that master switch (it pauses transactional SMS only; the
    in-app bell and sign-in codes are unaffected)."""
    _sync_prefs(user_id, {"opted_out": not enabled}, "transactional optin")
