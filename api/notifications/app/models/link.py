from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class RedirectLink(db.Model):
    """A short `/c/R<code>` that 302s to an in-app target and logs clicks.

    Shared + immutable: one row per (target_path, kind), reused across every
    recipient of a send (and every send of that same target+type). User-less, so
    never touched by the account purge. `target_path` is a validated same-origin
    RELATIVE path (never a `/c/...` target, never absolute)."""

    __tablename__ = "redirect_links"
    __table_args__ = (
        db.UniqueConstraint("target_path", "kind", name="uq_redirect_target_kind"),
    )

    # Type-prefixed (leading "R") + the shared no-ambiguous alphabet, like the
    # other /c codes — so a client/edge can route by prefix without a lookup.
    code = db.Column(db.String(16), primary_key=True)
    target_path = db.Column(db.Text, nullable=False)   # relative, e.g. /leagues/<id>/results?week=3
    kind = db.Column(db.String(64), nullable=False)    # template_key
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class LinkClick(db.Model):
    """One engagement event — a `/c/R` tap (source='link') OR an in-app open
    (source='inapp'). Carries user_id (PII) so it IS purged with the account.
    Prefer reading via rollups; raw rows get a retention TTL."""

    __tablename__ = "link_clicks"
    __table_args__ = (
        db.Index("ix_link_clicks_kind_user", "kind", "user_id"),
    )

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    source = db.Column(db.String(8), nullable=False)          # 'link' | 'inapp'
    kind = db.Column(db.String(64), nullable=False)           # template_key
    code = db.Column(db.String(16), nullable=True)            # set for source='link'
    user_id = db.Column(UUID(as_uuid=False), nullable=True, index=True)  # null = anonymous tap
    ua = db.Column(db.String(512), nullable=True)
    ip = db.Column(db.String(64), nullable=True)
    at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
