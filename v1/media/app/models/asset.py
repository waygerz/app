from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db

STATUS_PENDING = "pending"
STATUS_READY = "ready"
STATUS_DELETED = "deleted"

PURPOSE_COMMENT = "comment"
PURPOSE_MESSAGE = "message"
PURPOSE_LEAGUE_LOGO = "league_logo"
PURPOSE_AVATAR = "avatar"

# Attachments verified back to the posting service (owner-checked).
ALLOWED_PURPOSES = {PURPOSE_COMMENT, PURPOSE_MESSAGE}
# Member-visible display assets — resolved to a presigned URL for any signed-in
# viewer, not just the owner (league logos, avatars).
DISPLAY_PURPOSES = {PURPOSE_LEAGUE_LOGO, PURPOSE_AVATAR}
# Everything a client may request a presigned upload for.
UPLOAD_PURPOSES = ALLOWED_PURPOSES | DISPLAY_PURPOSES


class Asset(db.Model):
    """Uploaded image/GIF metadata — bytes live in S3."""

    __tablename__ = "assets"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    owner_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    purpose = db.Column(db.String(32), nullable=False)
    s3_bucket = db.Column(db.String(128), nullable=False)
    s3_key = db.Column(db.String(512), nullable=False)
    content_type = db.Column(db.String(64), nullable=False)
    byte_size = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(16), nullable=False, default=STATUS_PENDING)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    ready_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self, *, download_url: str | None = None):
        out = {
            "id": self.id,
            "owner_id": self.owner_id,
            "purpose": self.purpose,
            "s3_key": self.s3_key,
            "content_type": self.content_type,
            "byte_size": self.byte_size,
            "status": self.status,
            "created_at": self.created_at.isoformat() + "Z",
        }
        if self.ready_at:
            out["ready_at"] = self.ready_at.isoformat() + "Z"
        if download_url is not None:
            out["download_url"] = download_url
        return out