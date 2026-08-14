"""Create the profile row in the users service at signup.

Unlike the notifications opt-in sync (best-effort), the profile row is REQUIRED:
an account with no profile has no display_name and breaks every consumer. So
``create_profile`` RAISES on failure and the caller rolls back the just-created
auth row rather than leaving a profileless account.
"""
import logging

import requests

from app.utils.config import Config

logger = logging.getLogger(__name__)


class ProfileError(Exception):
    """The users service could not create/confirm the profile row."""


def create_profile(user_id, display_name, avatar_key=None) -> None:
    url = Config.INTERNAL_USERS_URL
    if not url:
        raise ProfileError("users service URL not configured")
    payload = {"user_id": str(user_id), "display_name": display_name}
    if avatar_key is not None:
        payload["avatar_key"] = avatar_key
    try:
        resp = requests.post(
            f"{url}/internal/profiles/upsert",
            json=payload,
            headers={"X-Internal-Token": Config.INTERNAL_TOKEN},
            timeout=10,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("profile create failed user_id=%s", user_id)
        raise ProfileError(str(exc))
    if not resp.ok:
        logger.warning("profile create %s: %s", resp.status_code, resp.text[:200])
        raise ProfileError(f"users service returned {resp.status_code}")
