from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class LeagueSport(db.Model):
    """Which sport-leagues (ingestor catalog) are bettable in this League.

    ``sport_league_id`` is a soft cross-service reference to the ingestor's
    sport_leagues catalog (no DB FK across schemas).
    """

    __tablename__ = "league_sports"
    __table_args__ = (
        db.UniqueConstraint("league_id", "sport_league_id", name="uq_league_sport"),
    )

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    sport_league_id = db.Column(db.String(64), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=True)  # display label (denormalized)

    def to_dict(self):
        return {
            "id": self.id,
            "league_id": self.league_id,
            "sport_league_id": self.sport_league_id,
            "name": self.name,
        }
