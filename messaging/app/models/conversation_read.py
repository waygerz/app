from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class ConversationRead(db.Model):
    """Per-user read cursor for a conversation thread."""

    __tablename__ = "conversation_reads"

    user_id = db.Column(UUID(as_uuid=False), primary_key=True)
    conversation_id = db.Column(
        UUID(as_uuid=False),
        db.ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    last_read_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)