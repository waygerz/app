from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db

# Ledger entry types
LEAGUE_GRANT = "league_grant"   # commissioner funds a member's league balance
WAGER_HOLD = "wager_hold"
WAGER_PAYOUT = "wager_payout"
WAGER_REFUND = "wager_refund"


class Transaction(db.Model):
    """Append-only money ledger. One row per balance change, scoped to an account.

    ``amount_cents`` is signed (negative for holds, positive for credits).
    ``account`` is the league wallet (``league:{uuid}``); ``ref`` ties an entry to
    its cause, e.g. "wager:123" or "league_grant:{league_id}".
    """

    __tablename__ = "transactions"
    __table_args__ = (
        # Idempotency: a given money move (per account, per user, per cause, per
        # type) happens once. Scoping by account keeps the same ref independent
        # across leagues.
        db.UniqueConstraint("account", "user_id", "ref", "type", name="uq_txn_idem"),
    )

    id = db.Column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=db.text("gen_random_uuid()"),
    )
    account = db.Column(db.String(64), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    ref = db.Column(db.String(64), nullable=True, index=True)
    type = db.Column(db.String(32), nullable=False)
    amount_cents = db.Column(db.BigInteger, nullable=False)
    balance_after_cents = db.Column(db.BigInteger, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "account": self.account,
            "user_id": self.user_id,
            "ref": self.ref,
            "type": self.type,
            "amount_cents": self.amount_cents,
            "balance_after_cents": self.balance_after_cents,
            "created_at": self.created_at.isoformat() + "Z",
        }
