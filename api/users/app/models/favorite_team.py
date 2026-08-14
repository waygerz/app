from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class FavoriteTeam(db.Model):
    """A team a user follows. References an ingestor team by the stable
    (sport, league, external_id) triple, but SNAPSHOTS the display fields
    (name/abbreviation/logo/color) so profile cards render without a live
    ingestor call — mirroring how wagers/picks denormalize team data.

    Ordered by ``position``; position 0 is the user's primary team. The
    per-user cap (Config.FAVORITE_TEAMS_MAX) is enforced in the service layer.
    """

    __tablename__ = "favorite_teams"
    __table_args__ = (
        db.UniqueConstraint(
            "user_id", "sport", "league", "external_id", name="uq_favorite_team"
        ),
    )

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    # = auth.users.id (a string UUID). Soft cross-service reference, no FK.
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    sport = db.Column(db.String(32), nullable=False)          # ingestor slug, e.g. "football"
    league = db.Column(db.String(32), nullable=False)         # ingestor slug, e.g. "nfl"
    external_id = db.Column(db.String(64), nullable=False)    # ESPN team id
    name = db.Column(db.String(120), nullable=False)          # snapshot
    abbreviation = db.Column(db.String(12), nullable=False)   # snapshot
    logo = db.Column(db.String(400), nullable=True)           # snapshot URL
    color = db.Column(db.String(16), nullable=True)           # snapshot hex
    position = db.Column(db.SmallInteger, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "sport": self.sport,
            "league": self.league,
            "external_id": self.external_id,
            "name": self.name,
            "abbreviation": self.abbreviation,
            "logo": self.logo,
            "color": self.color,
            "position": self.position,
        }
