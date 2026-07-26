from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class Balance(db.Model):
    """One balance per (account, user) — the user's play-money in a league.

    Every account is ``league:{uuid}``; there is no global balance anymore.
    Money enters only via a commissioner's grant (see ledger.grant)."""

    __tablename__ = "balances"

    account = db.Column(db.String(64), primary_key=True)  # e.g. "league:{uuid}"
    user_id = db.Column(UUID(as_uuid=False), primary_key=True)  # auth.users.id
    balance_cents = db.Column(db.BigInteger, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def to_dict(self):
        return {
            "account": self.account,
            "user_id": self.user_id,
            "balance_cents": self.balance_cents,
            "updated_at": self.updated_at.isoformat() + "Z" if self.updated_at else None,
        }
