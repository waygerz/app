from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db

# pick_side
HOME = "home"
AWAY = "away"
PICK_SIDES = (HOME, AWAY)


class Pick(db.Model):
    """A member's Pick'em selection for a single event within a period."""

    __tablename__ = "league_picks"
    __table_args__ = (
        db.UniqueConstraint("period_id", "user_id", "event_id", name="uq_pick"),
    )

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    period_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    event_id = db.Column(db.String(64), nullable=False)  # ingestor external_id
    pick_side = db.Column(db.String(8), nullable=False)  # home | away
    correct = db.Column(db.Boolean, nullable=True)  # null until graded
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def to_dict(self):
        return {
            "id": self.id,
            "league_id": self.league_id,
            "period_id": self.period_id,
            "user_id": self.user_id,
            "event_id": self.event_id,
            "pick_side": self.pick_side,
            "correct": self.correct,
            "created_at": self.created_at.isoformat() + "Z",
            "updated_at": self.updated_at.isoformat() + "Z",
        }
