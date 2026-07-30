from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class WagerInviteCode(db.Model):
    """A short /c/B<code> deep link to a specific wager, so the addressed
    acceptor can Accept/Reject it straight from the SMS notification.

    Single-use by nature — the wager's own status is the source of truth for
    whether it's still actionable (open → actionable; anything else → spent),
    so there's no consumed_at here."""

    __tablename__ = "wager_invite_codes"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    # Type-prefixed, human-typeable (e.g. B7M2PJH). Unique across all wagers.
    code = db.Column(db.String(16), nullable=False, unique=True, index=True)
    wager_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    created_by = db.Column(UUID(as_uuid=False), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
