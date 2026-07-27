from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class NotificationChannelPref(db.Model):
    """A user's opt-in for one (category, channel) pair — e.g. wager_alert/sms.

    Sparse: only rows that differ from the code-level defaults are stored. A
    missing row means "use the default" (see CHANNEL_DEFAULTS in
    service_internal). The global kill-switch lives on NotificationPreference
    (`opted_out`); this table is per-type, per-channel.
    """

    __tablename__ = "notification_channel_prefs"

    user_id = db.Column(UUID(as_uuid=False), primary_key=True)
    category = db.Column(db.String(32), primary_key=True)   # wager_alert | league_invite | friend_request | weekly_digest
    channel = db.Column(db.String(16), primary_key=True)    # sms | inapp
    enabled = db.Column(db.Boolean, nullable=False, default=True)

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "category": self.category,
            "channel": self.channel,
            "enabled": self.enabled,
        }
