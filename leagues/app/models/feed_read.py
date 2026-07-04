from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class LeagueFeedRead(db.Model):
    """Per-member watermark for league feed — posts after last_read_at count as unread."""

    __tablename__ = "league_feed_reads"
    __table_args__ = (
        db.UniqueConstraint("league_id", "user_id", name="uq_league_feed_read"),
    )

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    last_read_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)