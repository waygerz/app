from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db

# status
UPCOMING = "upcoming"
OPEN = "open"
CLOSED = "closed"
FINAL = "final"


class LeaguePeriod(db.Model):
    __tablename__ = "league_periods"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    index = db.Column(db.Integer, nullable=False)  # 1, 2, 3 … (1 for a season league)
    label = db.Column(db.String(40), nullable=False)  # "Week 3" / "Season"
    starts_at = db.Column(db.DateTime, nullable=True)
    ends_at = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(16), nullable=False, default=UPCOMING, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "league_id": self.league_id,
            "index": self.index,
            "label": self.label,
            "starts_at": self.starts_at.isoformat() + "Z" if self.starts_at else None,
            "ends_at": self.ends_at.isoformat() + "Z" if self.ends_at else None,
            "status": self.status,
        }
