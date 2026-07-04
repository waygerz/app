from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db

# status
PENDING = "pending"
ACCEPTED = "accepted"
DECLINED = "declined"
REVOKED = "revoked"


class LeagueInvite(db.Model):
    """A direct friend invite to a specific user. Code/link joins do NOT create
    a row here — they resolve join_code/invite_token straight to membership."""

    __tablename__ = "league_invites"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    inviter_id = db.Column(UUID(as_uuid=False), nullable=False)
    invitee_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    status = db.Column(db.String(16), nullable=False, default=PENDING, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "league_id": self.league_id,
            "inviter_id": self.inviter_id,
            "invitee_id": self.invitee_id,
            "status": self.status,
            "created_at": self.created_at.isoformat() + "Z",
        }
