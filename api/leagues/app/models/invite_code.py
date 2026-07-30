from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class LeagueInviteCode(db.Model):
    """A shareable /j/<code> link that joins a league. A league's default,
    reusable code is single_use=False; targeted one-time invites are
    single_use=True and get stamped consumed_at when used."""

    __tablename__ = "league_invite_codes"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    # Type-prefixed, human-typeable (e.g. L4K9QX7). Unique across all leagues.
    code = db.Column(db.String(16), nullable=False, unique=True, index=True)
    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    created_by = db.Column(UUID(as_uuid=False), nullable=False)
    single_use = db.Column(
        db.Boolean, nullable=False, default=False, server_default=db.text("false")
    )
    expires_at = db.Column(db.DateTime, nullable=True)
    consumed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
