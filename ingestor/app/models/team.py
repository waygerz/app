from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class Team(db.Model):
    """A team within a league. Keyed per (sport, league, external_id)."""

    __tablename__ = "teams"
    __table_args__ = (
        db.UniqueConstraint("sport", "league", "external_id", name="uq_team"),
    )

    id = db.Column(UUID(as_uuid=False), primary_key=True, server_default=db.text('gen_random_uuid()'))
    external_id = db.Column(db.String(64), nullable=False, index=True)

    sport = db.Column(db.String(40), nullable=False)
    league = db.Column(db.String(40), nullable=False, index=True)

    name = db.Column(db.String(120), nullable=False)  # displayName, e.g. "Arizona Cardinals"
    abbreviation = db.Column(db.String(12))
    slug = db.Column(db.String(120))
    location = db.Column(db.String(80))
    color = db.Column(db.String(8))
    alternate_color = db.Column(db.String(8))
    logo = db.Column(db.String(400))

    last_synced_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "external_id": self.external_id,
            "sport": self.sport,
            "league": self.league,
            "name": self.name,
            "abbreviation": self.abbreviation,
            "slug": self.slug,
            "location": self.location,
            "color": self.color,
            "alternate_color": self.alternate_color,
            "logo": self.logo,
        }
