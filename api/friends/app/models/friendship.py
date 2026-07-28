from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db

PENDING = "pending"
ACCEPTED = "accepted"
BLOCKED = "blocked"


class Friendship(db.Model):
    """A directed friend request (requester -> addressee) that becomes a
    two-way friendship once accepted. One row per ordered pair."""

    __tablename__ = "friendships"
    __table_args__ = (
        db.UniqueConstraint("requester_id", "addressee_id", name="uq_friend_pair"),
    )

    id = db.Column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=db.text('gen_random_uuid()'),
    )
    requester_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    addressee_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    status = db.Column(db.String(16), nullable=False, default=PENDING, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def other_id(self, me: str) -> str:
        return self.addressee_id if self.requester_id == me else self.requester_id
