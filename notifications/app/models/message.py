from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db

# status
QUEUED = "queued"
SENT = "sent"
DELIVERED = "delivered"
FAILED = "failed"


class Message(db.Model):
    """One outbound message (audit log + idempotency)."""

    __tablename__ = "messages"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    channel = db.Column(db.String(16), nullable=False, default="sms")  # sms|email|push
    category = db.Column(db.String(32), nullable=False)  # otp|wager_alert|weekly_digest
    # idempotency for event-driven sends (e.g. "wager:{id}:accepted"); OTP carries
    # a nonce/timestamp so it stays resendable.
    dedup_key = db.Column(db.String(160), nullable=True, unique=True)
    body = db.Column(db.Text, nullable=False)
    provider_msg_id = db.Column(db.String(128), nullable=True)
    status = db.Column(db.String(16), nullable=False, default=QUEUED, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def to_dict(self):
        return {
            "id": self.id, "user_id": self.user_id, "channel": self.channel,
            "category": self.category, "status": self.status,
            "provider_msg_id": self.provider_msg_id,
            "created_at": self.created_at.isoformat() + "Z",
        }
