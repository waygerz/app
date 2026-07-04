from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class ChatMessage(db.Model):
    """One message in a conversation."""

    __tablename__ = "chat_messages"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    conversation_id = db.Column(
        UUID(as_uuid=False),
        db.ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)
    read_at = db.Column(db.DateTime, nullable=True)
    edited_at = db.Column(db.DateTime, nullable=True)
    deleted = db.Column(db.Boolean, nullable=False, default=False)
    deleted_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self, *, author_name=None):
        out = {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "author_id": self.author_id,
            "body": "" if self.deleted else self.body,
            "created_at": self.created_at.isoformat() + "Z",
            "deleted": bool(self.deleted),
        }
        if self.read_at is not None:
            out["read_at"] = self.read_at.isoformat() + "Z"
        if self.edited_at is not None:
            out["edited_at"] = self.edited_at.isoformat() + "Z"
        if self.deleted_at is not None:
            out["deleted_at"] = self.deleted_at.isoformat() + "Z"
        if author_name is not None:
            out["author_name"] = author_name
        return out