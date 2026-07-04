from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db

# pool statuses
OPEN = "open"            # taking stakes, awaiting event result
SETTLED = "settled"      # parimutuel payout distributed to winners
REFUNDED = "refunded"    # draw / no winner / no winning stakes — all refunded
CANCELLED = "cancelled"  # event cancelled — all refunded


class Pool(db.Model):
    """League-scoped parimutuel pool: many members stake on one event's outcome.

    Stakes draw from the league wallet account (``league:{league_id}``). When the
    event is final, the whole pot is split among the winning side proportionally.
    """

    __tablename__ = "pools"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )

    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    period_id = db.Column(UUID(as_uuid=False), nullable=True)

    # Denormalized event snapshot (for display without re-querying ingestor).
    event_id = db.Column(db.String(64), nullable=False, index=True)  # ingestor external_id
    event_name = db.Column(db.String(200))
    league = db.Column(db.String(40))
    home_team = db.Column(db.String(120))
    away_team = db.Column(db.String(120))
    start_time = db.Column(db.String(40))

    status = db.Column(db.String(16), nullable=False, default=OPEN, index=True)
    winner_side = db.Column(db.String(8), nullable=True)  # home | away

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    settled_at = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        db.UniqueConstraint("league_id", "event_id", name="uq_pool_event"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "league_id": self.league_id,
            "period_id": self.period_id,
            "event_id": self.event_id,
            "event_name": self.event_name,
            "league": self.league,
            "home_team": self.home_team,
            "away_team": self.away_team,
            "start_time": self.start_time,
            "status": self.status,
            "winner_side": self.winner_side,
            "created_at": self.created_at.isoformat() + "Z",
            "settled_at": self.settled_at.isoformat() + "Z" if self.settled_at else None,
        }


class PoolStake(db.Model):
    """One member's stake on one side of a pool."""

    __tablename__ = "pool_stakes"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )

    pool_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    side = db.Column(db.String(8), nullable=False)  # home | away
    amount_cents = db.Column(db.BigInteger, nullable=False)

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "pool_id": self.pool_id,
            "league_id": self.league_id,
            "user_id": self.user_id,
            "side": self.side,
            "amount_cents": self.amount_cents,
            "created_at": self.created_at.isoformat() + "Z",
        }
