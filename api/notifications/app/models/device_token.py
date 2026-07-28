from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class DeviceToken(db.Model):
    """A user's push token for one device (FCM registration token — covers iOS
    via Firebase's APNs relay and Android directly). Push tokens are globally
    unique, so a re-register upserts by token and can move it to a new user."""

    __tablename__ = "device_tokens"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    platform = db.Column(db.String(16), nullable=False)  # ios | android
    token = db.Column(db.String(512), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def to_dict(self):
        return {
            "id": self.id,
            "platform": self.platform,
            "token": self.token,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }
