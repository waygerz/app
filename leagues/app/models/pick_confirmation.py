from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class PickConfirmation(db.Model):
    """A commissioner's per-week confirmation of a member (the green check).

    Absence of a row means unconfirmed; the commissioner toggles `confirmed`.
    """

    __tablename__ = "league_pick_confirmations"
    __table_args__ = (
        db.UniqueConstraint("period_id", "user_id", name="uq_pick_confirm"),
    )

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    period_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    confirmed = db.Column(db.Boolean, nullable=False, default=False)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
