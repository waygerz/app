from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db

DIRECT = "direct"
LEAGUE = "league"


class Conversation(db.Model):
    """A chat thread — either a 1:1 DM or a league group channel."""

    __tablename__ = "conversations"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    type = db.Column(db.String(16), nullable=False, index=True)
    league_id = db.Column(UUID(as_uuid=False), nullable=True, unique=True)
    # sorted user-id pair key for direct threads: "uuid_a:uuid_b"
    direct_key = db.Column(db.String(80), nullable=True, unique=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self, *, last_message=None, unread_count=0, other_user=None):
        out = {
            "id": self.id,
            "type": self.type,
            "league_id": self.league_id,
            "created_at": self.created_at.isoformat() + "Z",
            "unread_count": unread_count,
        }
        if last_message is not None:
            out["last_message"] = last_message
        if other_user is not None:
            out["other_user"] = other_user
        return out

    def other_user_id(self, me: str) -> str | None:
        if self.type != DIRECT or not self.direct_key:
            return None
        parts = self.direct_key.split(":")
        me = str(me)
        for part in parts:
            if part != me:
                return part
        return None