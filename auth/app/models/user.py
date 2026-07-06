from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class User(db.Model):
    """A Waygerz account — identity only. Balance lives in the wallet service."""

    __tablename__ = "users"

    id = db.Column(UUID(as_uuid=False), primary_key=True, server_default=db.text('gen_random_uuid()'))
    phone = db.Column(db.String(32), unique=True, nullable=False, index=True)
    # Legacy: passwordless (phone + OTP) auth no longer sets or checks a PIN.
    # Kept nullable so existing rows retain their hash; new users have none.
    pin_hash = db.Column(db.String(255), nullable=True)
    display_name = db.Column(db.String(64), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "phone": self.phone,
            "display_name": self.display_name,
            "created_at": self.created_at.isoformat() + "Z",
        }
