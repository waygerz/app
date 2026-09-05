from datetime import datetime

from sqlalchemy.dialects.postgresql import JSONB, UUID

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
    # The winner has claimed the pot. Only the score-decided winner can set this;
    # doing so pays them and moves the wager to settled.
    confirmed = db.Column(db.Boolean, nullable=False, default=False,
                          server_default=db.text("false"))

    # Mutual cancellation of an ACCEPTED wager: both sides have money held, so
    # one side asks and the other approves. Null once approved, rejected, or on
    # a wager nobody has asked about.
    cancel_requested_by = db.Column(UUID(as_uuid=False), nullable=True)
    cancel_requested_at = db.Column(db.DateTime, nullable=True)

    # ---- Counter-offer negotiation (see .docs/pending/COUNTER_OFFER_PLAN.md) --
    # A wager is renegotiated in place: exactly one stake is held while OPEN (the
    # `held_id`'s, at the exact ref `held_ref`), and `pending_id` is whose turn it
    # is to approve/counter/decline. Money conservation is guaranteed by the
    # reconciler keyed off the stored ref strings — never a recomputed ref.
    #   held_id    — the member whose single negotiation stake is currently held
    #   held_ref   — the EXACT wallet ref where that stake sits ("wager:{id}" for a
    #                fresh/migrated row, "wager:{id}:r{n}:{nonce}" after a counter)
    #   stake_round— monotonic counter bumped only by `counter` (propose=0)
    #   accept_ref — EXACT ref of the approver's stake once ACCEPTED (null while OPEN;
    #                migrated ACCEPTED rows carry the base ref, where accept held)
    #   pending_id — whose turn it is to act; null once the wager leaves negotiation
    #   negotiation— append-only round log [{by, amount_cents, line, at}]
    held_id = db.Column(UUID(as_uuid=False), nullable=True)
    held_ref = db.Column(db.String(80), nullable=True)
    stake_round = db.Column(db.Integer, nullable=False, default=0,
                            server_default=db.text("0"))
    accept_ref = db.Column(db.String(80), nullable=True)
    pending_id = db.Column(UUID(as_uuid=False), nullable=True)
    negotiation = db.Column(JSONB, nullable=False, default=list,
                            server_default=db.text("'[]'::jsonb"))

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)  # when the event was marked over
    settled_at = db.Column(db.DateTime, nullable=True)

    _OPPOSITE = {"home": "away", "away": "home", "over": "under", "under": "over"}

    @property
    def acceptor_side(self) -> str:
        return self._OPPOSITE.get(self.proposer_side, self.proposer_side)

    def involves(self, user_id: str) -> bool:
        return user_id in (self.proposer_id, self.acceptor_id)

    def other_party(self, user_id: str) -> str:
        """The counterparty of `user_id` on this wager (proposer<->acceptor)."""
        return self.acceptor_id if user_id == self.proposer_id else self.proposer_id

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
            "confirmed": self.confirmed,
            "cancel_requested_by": self.cancel_requested_by,
            "cancel_requested_at": (
                self.cancel_requested_at.isoformat() + "Z" if self.cancel_requested_at else None
            ),
            # Negotiation state for the client. The exact ref strings
            # (held_ref/accept_ref) stay server-side; `my_turn` is added per-viewer
            # by the enrich layer, not here (to_dict has no viewer identity).
            "held_id": self.held_id,
            "pending_id": self.pending_id,
            "stake_round": self.stake_round or 0,
            "negotiation": self.negotiation or [],
            "created_at": self.created_at.isoformat() + "Z",
            "completed_at": self.completed_at.isoformat() + "Z" if self.completed_at else None,
            "settled_at": self.settled_at.isoformat() + "Z" if self.settled_at else None,
        }
