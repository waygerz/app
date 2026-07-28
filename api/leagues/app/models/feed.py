from datetime import datetime

from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.extensions import db

# kind
ANNOUNCEMENT = "announcement"  # commissioner/user post
ACTIVITY = "activity"          # system-generated


class LeagueFeed(db.Model):
    """The league news feed: system activity + commissioner announcements."""

    __tablename__ = "league_feed"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    kind = db.Column(db.String(16), nullable=False, index=True)
    # for activity: member_joined | period_opened | period_final | wager_accepted | wager_settled | standings …
    event_type = db.Column(db.String(40), nullable=True)
    author_id = db.Column(UUID(as_uuid=False), nullable=True)  # null for system activity
    title = db.Column(db.String(160), nullable=True)
    body = db.Column(db.Text, nullable=True)
    link_url = db.Column(db.String(500), nullable=True)
    link_label = db.Column(db.String(80), nullable=True)
    meta = db.Column(JSONB, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)
    # idempotency for event-driven activity (e.g. wager_settled:{wager_id})
    dedup_key = db.Column(db.String(120), nullable=True, unique=True)

    def to_dict(self):
        return {
            "id": self.id,
            "league_id": self.league_id,
            "kind": self.kind,
            "event_type": self.event_type,
            "author_id": self.author_id,
            "title": self.title,
            "body": self.body,
            "link_url": self.link_url,
            "link_label": self.link_label,
            "meta": self.meta,
            "created_at": self.created_at.isoformat() + "Z",
        }
