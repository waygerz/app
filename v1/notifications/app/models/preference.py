from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class NotificationPreference(db.Model):
    """Per-user, account-level notification switch. The only thing here is the
    global STOP; per-type, per-channel opt-ins live in NotificationChannelPref."""

    __tablename__ = "notification_preferences"

    user_id = db.Column(UUID(as_uuid=False), primary_key=True)
    opted_out = db.Column(db.Boolean, nullable=False, default=False)      # global STOP

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "opted_out": self.opted_out,
        }
