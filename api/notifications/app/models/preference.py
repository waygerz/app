from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class NotificationPreference(db.Model):
    """Per-user, account-level notification switch. `opted_out` is the
    app-notifications SMS master (true = pause transactional SMS; the in-app
    bell and marketing are unaffected). Per-type, per-channel opt-ins live in
    NotificationChannelPref."""

    __tablename__ = "notification_preferences"

    user_id = db.Column(UUID(as_uuid=False), primary_key=True)
    # App-notifications SMS master: true pauses transactional SMS only.
    opted_out = db.Column(db.Boolean, nullable=False, default=False)

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "opted_out": self.opted_out,
        }
