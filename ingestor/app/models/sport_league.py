from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class SportLeague(db.Model):
    """First-class catalog entity for a sport-league (e.g. basketball/nba).

    The ingestor owns + mints these UUIDs, upserting on the natural key
    (sport, league) where both are the API's slug values — the same strings an
    Event carries. Leagues reference a league's bettable sports by this id."""

    __tablename__ = "sport_leagues"
    __table_args__ = (
        db.UniqueConstraint("sport", "league", name="uq_sport_league"),
    )

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    sport = db.Column(db.String(40), nullable=False)   # e.g. "basketball" (slug)
    league = db.Column(db.String(40), nullable=False)  # e.g. "nba" (slug; == events.league)
    name = db.Column(db.String(120), nullable=True)    # display, e.g. "NBA"
    logo = db.Column(db.String(400), nullable=True)
    active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "sport": self.sport, "league": self.league,
            "name": self.name, "logo": self.logo, "active": self.active,
        }
