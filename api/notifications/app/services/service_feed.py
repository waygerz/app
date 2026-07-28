"""User-facing notification feed (the app's notifications sheet)."""
from app.extensions import db
from app.models.notification import Notification
from app.services.service_internal import (
    get_preferences_matrix,
    register_device as _register_device,
    set_preferences_matrix,
    unregister_device as _unregister_device,
)

_MAX_LIMIT = 100


def list_feed(user_id: str, *, limit: int = 50, unread_only: bool = False) -> tuple[dict, int]:
    limit = max(1, min(int(limit), _MAX_LIMIT))
    q = Notification.query.filter_by(user_id=user_id)
    if unread_only:
        q = q.filter_by(read=False)
    rows = q.order_by(Notification.created_at.desc()).limit(limit).all()
    unread = Notification.query.filter_by(user_id=user_id, read=False).count()
    return {"notifications": [n.to_dict() for n in rows], "unread": unread}, 200


def unread_count(user_id: str) -> tuple[dict, int]:
    n = Notification.query.filter_by(user_id=user_id, read=False).count()
    return {"unread": n}, 200


def mark_read(user_id: str, ids=None) -> tuple[dict, int]:
    """Mark the given notification ids read, or all of the user's if ids is empty."""
    q = Notification.query.filter_by(user_id=user_id, read=False)
    if ids:
        q = q.filter(Notification.id.in_([str(i) for i in ids]))
    updated = q.update({Notification.read: True}, synchronize_session=False)
    db.session.commit()
    return {"updated": updated}, 200


def get_preferences(user_id: str) -> tuple[dict, int]:
    return {"preferences": get_preferences_matrix(user_id)}, 200


def update_preferences(user_id: str, data: dict) -> tuple[dict, int]:
    """Patch the caller's own preferences. user_id comes from the JWT, never the
    body, so a user can only ever edit their own settings."""
    return {"preferences": set_preferences_matrix(user_id, data)}, 200


def register_device(user_id: str, data: dict) -> tuple[dict, int]:
    """Register (or refresh) the caller's push token for one device."""
    try:
        device = _register_device(user_id, data.get("platform"), data.get("token"))
    except ValueError as e:
        return {"error": str(e)}, 400
    return {"device": device}, 200


def unregister_device(user_id: str, data: dict) -> tuple[dict, int]:
    """Drop one of the caller's push tokens (logout / uninstall)."""
    removed = _unregister_device(user_id, data.get("token"))
    return {"removed": removed}, 200
