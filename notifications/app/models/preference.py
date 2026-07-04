from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class NotificationPreference(db.Model):
    """Per-user notification preferences (TCPA: digest is opt-in)."""

    __tablename__ = "notification_preferences"

    user_id = db.Column(UUID(as_uuid=False), primary_key=True)
    wager_alerts = db.Column(db.Boolean, nullable=False, default=True)   # transactional
    weekly_digest = db.Column(db.Boolean, nullable=False, default=False)  # promotional, opt-in
    opted_out = db.Column(db.Boolean, nullable=False, default=False)      # global STOP

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "wager_alerts": self.wager_alerts,
            "weekly_digest": self.weekly_digest,
            "opted_out": self.opted_out,
        }
