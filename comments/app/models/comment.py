from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class Comment(db.Model):
    """A user comment on a league feed post (league_feed.id in the leagues schema)."""

    __tablename__ = "comments"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    post_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    author_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    parent_id = db.Column(
        UUID(as_uuid=False),
        db.ForeignKey("comments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def to_dict(self, *, author_name=None, replies=None):
        out = {
            "id": self.id,
            "post_id": self.post_id,
            "league_id": self.league_id,
            "author_id": self.author_id,
            "parent_id": self.parent_id,
            "body": self.body,
            "created_at": self.created_at.isoformat() + "Z",
            "updated_at": self.updated_at.isoformat() + "Z",
        }
        if author_name is not None:
            out["author_name"] = author_name
        if replies is not None:
            out["replies"] = replies
        return out