"""Self-serve account deletion — the cross-service orchestrator.

`DELETE /account` runs here, authenticated as the caller (user id from the JWT,
so a user can only ever delete themselves). It:

  1. PREFLIGHT — asks leagues for the non-archived leagues this user commissions.
     If any, it aborts 409 so the user transfers/archives them first (never
     orphaning a live league other members use).
  2. FAN-OUT — POSTs /internal/purge-user to every leaf service in an order that
     resolves money before memberships/accounts vanish. Each purge is idempotent
     and the account row is deleted LAST, so a mid-fail run is safely re-runnable.
  3. LOCAL — deletes the user's sessions + the auth.users row.
  4. Clears the auth cookies on the response (or the SPA would loop between / and
     /login, which gate purely on cookie presence).

There is no distributed transaction; safety rests on idempotency + account-last.
A downstream failure returns 500 and the client (or an operator) retries.
"""
import logging

import requests
from flask import jsonify, make_response

from app.extensions import db
from app.models.user import User
from app.services import _sessions
from app.utils.config import Config
from app.utils.cookies import clear_auth_cookies

logger = logging.getLogger(__name__)

# (name, base-url) in fan-out order. contests first so its refunds land in
# balances/leagues that still exist; media before users so the avatar object is
# gone before the profile tombstone nulls its reference.
_PURGE_ORDER = [
    ("contests", lambda: Config.INTERNAL_CONTESTS_URL),
    ("wallet", lambda: Config.INTERNAL_WALLET_URL),
    ("leagues", lambda: Config.INTERNAL_LEAGUES_URL),
    ("friends", lambda: Config.INTERNAL_FRIENDS_URL),
    ("messaging", lambda: Config.INTERNAL_MESSAGING_URL),
    ("comments", lambda: Config.INTERNAL_COMMENTS_URL),
    ("notifications", lambda: Config.INTERNAL_NOTIFICATIONS_URL),
    ("media", lambda: Config.INTERNAL_MEDIA_URL),
    ("users", lambda: Config.INTERNAL_USERS_URL),
]

_TIMEOUT = 20


def _headers() -> dict:
    return {"X-Internal-Token": Config.INTERNAL_TOKEN}


def _commissioned_leagues(user_id: str):
    """Return the list of non-archived leagues the user commissions, or raise."""
    url = Config.INTERNAL_LEAGUES_URL
    resp = requests.post(
        f"{url}/internal/commissioned-leagues",
        json={"user_id": user_id},
        headers=_headers(),
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("leagues", [])


def _purge(name: str, url: str, user_id: str) -> None:
    resp = requests.post(
        f"{url}/internal/purge-user",
        json={"user_id": user_id},
        headers=_headers(),
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()


def delete_account(user_id: str):
    user_id = str(user_id)

    # 1. Preflight — block on owned (non-archived) leagues.
    try:
        owned = _commissioned_leagues(user_id)
    except Exception:  # noqa: BLE001
        logger.exception("delete_account preflight failed user_id=%s", user_id)
        return jsonify({"error": "could not verify your leagues — try again"}), 502
    if owned:
        return (
            jsonify(
                {
                    "error": "owns_leagues",
                    "message": "You're the commissioner of a league. Transfer it to "
                    "another member or archive it before deleting your account.",
                    "leagues": owned,
                }
            ),
            409,
        )

    # 2. Fan-out purge (money → memberships → tombstone), account row untouched.
    for name, url_fn in _PURGE_ORDER:
        url = url_fn()
        try:
            _purge(name, url, user_id)
        except Exception:  # noqa: BLE001
            logger.exception("delete_account purge failed service=%s user_id=%s", name, user_id)
            return (
                jsonify(
                    {
                        "error": "purge_failed",
                        "service": name,
                        "message": "Something went wrong deleting your data. "
                        "Please try again.",
                    }
                ),
                500,
            )

    # 3. Local: sessions, then the account row LAST.
    try:
        _sessions.delete_user_sessions(user_id)
        user = db.session.get(User, user_id)
        if user is not None:
            db.session.delete(user)
            db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("delete_account local delete failed user_id=%s", user_id)
        return jsonify({"error": "purge_failed", "service": "auth"}), 500

    # 4. Clear cookies so the SPA doesn't loop between / and /login.
    response = make_response(jsonify({"message": "account deleted"}), 200)
    clear_auth_cookies(response)
    return response
