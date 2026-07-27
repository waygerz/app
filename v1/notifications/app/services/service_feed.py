"""User-facing notification feed (the app's notifications sheet)."""
from app.extensions import db
from app.models.notification import Notification
from app.services.service_internal import _prefs

_MAX_LIMIT = 100

# Fields a user may flip for themselves. Mirrors NotificationPreference; the
# per-category flags gate SMS, `opted_out` is the global STOP (in-app + SMS).
_PREF_FIELDS = ("wager_alerts", "weekly_digest", "opted_out")


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
    return {"preferences": _prefs(user_id).to_dict()}, 200


def update_preferences(user_id: str, data: dict) -> tuple[dict, int]:
    """Patch the caller's own preferences — only the whitelisted flags, and only
    for `user_id` (taken from the JWT, never the body)."""
    p = _prefs(user_id)
    for f in _PREF_FIELDS:
        if f in data:
            setattr(p, f, bool(data[f]))
    db.session.commit()
    return {"preferences": p.to_dict()}, 200
