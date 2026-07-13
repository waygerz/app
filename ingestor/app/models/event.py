from datetime import datetime

from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.extensions import db

# status values
SCHEDULED = "scheduled"
LIVE = "live"
FINAL = "final"
CANCELLED = "cancelled"


class Event(db.Model):
    """A cached sporting event. The durable system-of-record for events
    (Redis only ever holds throwaway copies of API responses)."""

    __tablename__ = "events"

    id = db.Column(UUID(as_uuid=False), primary_key=True, server_default=db.text('gen_random_uuid()'))
    external_id = db.Column(db.String(64), unique=True, nullable=False, index=True)

    sport = db.Column(db.String(40), nullable=False)
    league = db.Column(db.String(40), nullable=False, index=True)
    # Catalog id (sport_leagues.id) for the (sport, league) this event belongs to.
    sport_league_id = db.Column(UUID(as_uuid=False), nullable=True, index=True)

    name = db.Column(db.String(200), nullable=False)
    short_name = db.Column(db.String(80))

    home_team = db.Column(db.String(120), nullable=False)
    home_abbr = db.Column(db.String(12))
    away_team = db.Column(db.String(120), nullable=False)
    away_abbr = db.Column(db.String(12))

    start_time = db.Column(db.DateTime)
    status = db.Column(db.String(20), nullable=False, default=SCHEDULED, index=True)

    home_score = db.Column(db.Integer)
    away_score = db.Column(db.Integer)
    winner_side = db.Column(db.String(8))  # home | away | draw | None

    # Native-week metadata (ESPN team-sport schedule). season_year + week_number
    # come straight from ESPN; week_label is the calendar entry ("Regular Season
    # Week 1"). Null for date-based sports (bucketed into calendar weeks instead).
    season_year = db.Column(db.Integer)
    week_number = db.Column(db.Integer)
    week_label = db.Column(db.String(80))

    # Last-known betting odds ({moneyline, spread, overUnder}), persisted so we
    # serve a durable line from SQL instead of re-hitting the metered API on
    # every view (and so odds survive a quota-exhausted window).
    odds = db.Column(JSONB)
    odds_updated_at = db.Column(db.DateTime)

    last_synced_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "external_id": self.external_id,
            "sport": self.sport,
            "league": self.league,
            "sport_league_id": self.sport_league_id,
            "name": self.name,
            "short_name": self.short_name,
            "home_team": self.home_team,
            "home_abbr": self.home_abbr,
            "away_team": self.away_team,
            "away_abbr": self.away_abbr,
            "start_time": self.start_time.isoformat() + "Z" if self.start_time else None,
            "status": self.status,
            "home_score": self.home_score,
            "away_score": self.away_score,
            "winner_side": self.winner_side,
            "season_year": self.season_year,
            "week_number": self.week_number,
            "week_label": self.week_label,
            "odds": self.odds,
            "odds_updated_at": (
                self.odds_updated_at.isoformat() + "Z" if self.odds_updated_at else None
            ),
            "last_synced_at": (
                self.last_synced_at.isoformat() + "Z" if self.last_synced_at else None
            ),
        }
