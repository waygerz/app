from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class FriendInviteCode(db.Model):
    """A shareable /j/<code> link that befriends the code's owner. A user's
    personal, reusable link is single_use=False; one-time invites are
    single_use=True and get stamped consumed_at when used."""

    __tablename__ = "friend_invite_codes"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    # Type-prefixed, human-typeable (e.g. F7M2PJH). Unique across all users.
    code = db.Column(db.String(16), nullable=False, unique=True, index=True)
    # Accepting this code befriends this user.
    owner_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    single_use = db.Column(
        db.Boolean, nullable=False, default=False, server_default=db.text("false")
    )
    expires_at = db.Column(db.DateTime, nullable=True)
    consumed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
