from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db

# bet types (the market the wager is on)
MONEYLINE = "moneyline"  # pick the outright winner (SU / straight up)
SPREAD = "spread"        # pick a team to cover the point/run/puck spread (ATS)
TOTAL = "total"          # pick the combined score over/under a line
BET_TYPES = (MONEYLINE, SPREAD, TOTAL)

# statuses
OPEN = "open"            # proposed, awaiting friend's response
ACCEPTED = "accepted"    # both staked, event in play
COMPLETED = "completed"  # event over, stakes still held, awaiting the winner's confirmation
SETTLED = "settled"      # winner confirmed; paid out
DECLINED = "declined"    # friend declined; proposer refunded
CANCELLED = "cancelled"  # proposer cancelled; refunded
REFUNDED = "refunded"    # draw / event cancelled; both refunded


class Wager(db.Model):
    """Even-money head-to-head bet between two league members on one event."""

    __tablename__ = "wagers"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )

    # Every wager is league-scoped — money draws from the league wallet account
    # (league:{league_id}) and the bet is governed by that league's rules.
    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    period_id = db.Column(UUID(as_uuid=False), nullable=True, index=True)

    # Denormalized event snapshot (for display without re-querying ingestor).
    event_id = db.Column(db.String(64), nullable=False, index=True)  # ingestor external_id
    event_name = db.Column(db.String(200))
    league = db.Column(db.String(40))
    home_team = db.Column(db.String(120))
    away_team = db.Column(db.String(120))
    start_time = db.Column(db.String(40))

    proposer_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    acceptor_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    # For moneyline/spread the side is home|away; for a total it's over|under.
    proposer_side = db.Column(db.String(8), nullable=False)
    # The market and (for spread/total) the line the proposer took. bet_type
    # defaults to moneyline so every pre-existing wager reads as a straight-up
    # pick. line is the proposer's number: e.g. spread -1.5, total 8.5.
    bet_type = db.Column(db.String(12), nullable=False, default=MONEYLINE,
                         server_default=MONEYLINE)
    line = db.Column(db.Float, nullable=True)
    amount_cents = db.Column(db.BigInteger, nullable=False)

    status = db.Column(db.String(16), nullable=False, default=OPEN, index=True)
    winner_user_id = db.Column(UUID(as_uuid=False), nullable=True)
    # Who confirmed the result (the winner self-claiming, or the loser conceding).
    confirmed_by_id = db.Column(UUID(as_uuid=False), nullable=True)

    # Mutual cancellation of an ACCEPTED wager: both sides have money held, so
    # one side asks and the other approves. Null once approved, rejected, or on
    # a wager nobody has asked about.
    cancel_requested_by = db.Column(UUID(as_uuid=False), nullable=True)
    cancel_requested_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)  # when the event was marked over
    settled_at = db.Column(db.DateTime, nullable=True)

    _OPPOSITE = {"home": "away", "away": "home", "over": "under", "under": "over"}

    @property
    def acceptor_side(self) -> str:
        return self._OPPOSITE.get(self.proposer_side, self.proposer_side)

    def involves(self, user_id: str) -> bool:
        return user_id in (self.proposer_id, self.acceptor_id)

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
            "proposer_id": self.proposer_id,
            "acceptor_id": self.acceptor_id,
            "proposer_side": self.proposer_side,
            "acceptor_side": self.acceptor_side,
            "bet_type": self.bet_type or MONEYLINE,
            "line": self.line,
            "amount_cents": self.amount_cents,
            "status": self.status,
            "winner_user_id": self.winner_user_id,
            "confirmed_by_id": self.confirmed_by_id,
            "cancel_requested_by": self.cancel_requested_by,
            "cancel_requested_at": (
                self.cancel_requested_at.isoformat() + "Z" if self.cancel_requested_at else None
            ),
            "created_at": self.created_at.isoformat() + "Z",
            "completed_at": self.completed_at.isoformat() + "Z" if self.completed_at else None,
            "settled_at": self.settled_at.isoformat() + "Z" if self.settled_at else None,
        }
