from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class PostLike(db.Model):
    """A league member's like on a feed post."""

    __tablename__ = "post_likes"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    post_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("post_id", "user_id", name="uq_post_like_user"),
    )