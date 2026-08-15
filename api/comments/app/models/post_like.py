from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class PostLike(db.Model):
    """A league member's reaction on a feed post. One row per (post, user) — the
    reaction key (like/love/haha/...) replaces on change; removing deletes the row.
    Table name kept as post_likes to avoid churn (a like is reaction='like')."""

    __tablename__ = "post_likes"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    post_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    # One of app.reactions.REACTIONS. Existing likes backfill to 'like'.
    reaction = db.Column(db.String(16), nullable=False, server_default="like")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("post_id", "user_id", name="uq_post_like_user"),
    )