from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db

# role
COMMISSIONER = "commissioner"
MODERATOR = "moderator"
MEMBER = "member"

# status
ACTIVE = "active"
LEFT = "left"
REMOVED = "removed"


class LeagueMember(db.Model):
    __tablename__ = "league_members"
    __table_args__ = (
        db.UniqueConstraint("league_id", "user_id", name="uq_league_member"),
    )

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    league_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    role = db.Column(db.String(16), nullable=False, default=MEMBER)
    status = db.Column(db.String(16), nullable=False, default=ACTIVE, index=True)
    joined_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "league_id": self.league_id,
            "user_id": self.user_id,
            "role": self.role,
            "status": self.status,
            "joined_at": self.joined_at.isoformat() + "Z",
        }
