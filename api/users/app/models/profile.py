from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class Profile(db.Model):
    """A user's public profile. Keyed by the auth account id (same value the JWT
    identity carries). The credentials/identity row lives in the auth service;
    this holds the display fields that used to squat in auth.users."""

    __tablename__ = "profiles"
    __table_args__ = (
        # Supports the no-favorites nudge tick: a partial index over un-nudged
        # rows only, so it stays tiny (near-empty once everyone's been nudged).
        db.Index(
            "ix_profiles_pending_nudge",
            "created_at",
            postgresql_where=db.text("favorites_nudged_at IS NULL"),
        ),
    )

    # = auth.users.id (a string UUID). Soft cross-service reference, no FK.
    user_id = db.Column(UUID(as_uuid=False), primary_key=True)
    display_name = db.Column(db.String(64), nullable=False)
    # S3 object key for the avatar (members/avatars/...), or null for the
    # generated initials avatar. Resolved to a presigned URL by the webui.
    avatar_key = db.Column(db.String(512), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    # When the one-time "pick your favorite teams" nudge was sent (null = not yet).
    favorites_nudged_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "display_name": self.display_name,
            "avatar_key": self.avatar_key,
        }
