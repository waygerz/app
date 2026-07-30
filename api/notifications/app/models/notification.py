"""In-app notification feed.

One row per user-facing notification, shown in the app's notifications sheet.
Written by notify() alongside (optionally) an SMS, so a single trigger fans out
to both the feed and the phone. `ref_type`/`ref_id` let the client deep-link and
render inline actions (e.g. an actionable wager), and `read` drives the badge.
"""
from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    category = db.Column(db.String(32), nullable=False)  # wager_alert|league_invite|...
    # The specific event, so the client can pick an icon + inline actions
    # (e.g. wager_proposed vs wager_settled_win). Nullable for legacy rows.
    template_key = db.Column(db.String(64), nullable=True)
    title = db.Column(db.String(160), nullable=False)
    body = db.Column(db.Text, nullable=False)
    # Who the notification is *from*, so the sheet can show their avatar.
    actor_id = db.Column(db.String(64), nullable=True)
    actor_name = db.Column(db.String(120), nullable=True)
    actor_avatar_key = db.Column(db.Text, nullable=True)
    # What the notification is about, for deep-links + inline actions.
    ref_type = db.Column(db.String(16), nullable=True)   # wager|league|friend
    ref_id = db.Column(db.String(64), nullable=True)
    deep_link = db.Column(db.String(200), nullable=True)  # in-app path, e.g. /bets/pending
    read = db.Column(
        db.Boolean, nullable=False, default=False, server_default=db.text("false"), index=True
    )
    dedup_key = db.Column(db.String(160), nullable=True, unique=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "category": self.category,
            "template_key": self.template_key,
            "title": self.title,
            "body": self.body,
            "actor_id": self.actor_id,
            "actor_name": self.actor_name,
            "actor_avatar_key": self.actor_avatar_key,
            "ref_type": self.ref_type,
            "ref_id": self.ref_id,
            "deep_link": self.deep_link,
            "read": self.read,
            "created_at": self.created_at.isoformat() + "Z",
        }
