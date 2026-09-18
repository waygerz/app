from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class FavoriteLeague(db.Model):
    """A sports league a user has pinned (the star on the sports pages).
    Identified by the ingestor's (sport, league) slugs, with the display fields
    SNAPSHOTTED so the pinned list renders without a live ingestor call — same
    approach as FavoriteTeam.

    Ordered by ``position`` (pin order). Private to the user: unlike favorite
    teams it is NOT part of the (publicly viewable) profile. The per-user cap
    (Config.FAVORITE_LEAGUES_MAX) is enforced in the service layer.
    """

    __tablename__ = "favorite_leagues"
    __table_args__ = (
        db.UniqueConstraint("user_id", "sport", "league", name="uq_favorite_league"),
    )

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    # = auth.users.id (a string UUID). Soft cross-service reference, no FK.
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    sport = db.Column(db.String(32), nullable=False)        # ingestor slug, e.g. "football"
    league = db.Column(db.String(32), nullable=False)       # ingestor slug, e.g. "nfl"
    name = db.Column(db.String(120), nullable=False)        # snapshot
    abbreviation = db.Column(db.String(24), nullable=True)  # snapshot
    logo = db.Column(db.String(400), nullable=True)         # snapshot URL
    position = db.Column(db.SmallInteger, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "sport": self.sport,
            "league": self.league,
            "name": self.name,
            "abbreviation": self.abbreviation,
            "logo": self.logo,
            "position": self.position,
        }
