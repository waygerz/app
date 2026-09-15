"""`/c/R` link shortening + click tracking.

- `maybe_shorten_link_context(context, kind)` — called on the SMS branch of a
  notify(): if `context["link"]` is a shortenable same-origin non-`/c` path, swap
  it for a `https://waygerz.com/c/R<code>` shortlink (idempotent per target+kind).
- `resolve_and_click(code, ...)` — the `/c/R<code>` handler: look up the target,
  log a click, return the relative target to 302 to.
- `record_inapp_open(user_id, template_key, ...)` — goal A: an in-app open.

Best-effort throughout: a failure here must never block a notification send.
"""
import re
import secrets
from urllib.parse import urlsplit, urlunsplit

from flask import current_app
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.link import LinkClick, RedirectLink

# Same no-ambiguous alphabet the other /c codes use (no I/O/0/1); leading "R"
# marks a redirect code so the edge can route /c/R* without a lookup.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_BODY_LEN = 7

# Our canonical origin — the only host we shorten/redirect to.
_ORIGIN = "https://waygerz.com"
# Only these leading path segments may be shortened/redirected to (never /c/*).
_ALLOWED_PREFIXES = ("/leagues", "/friends")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def _gen_code() -> str:
    return "R" + "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_BODY_LEN))


def normalize_target(link: str) -> str | None:
    """Turn an emitter's absolute link into a validated same-origin RELATIVE
    path+query eligible for shortening, or None if it isn't (external host, a
    `/c/...` code, or not allowlisted). Rejects protocol-relative/backslash/
    control-char tricks."""
    if not link or not isinstance(link, str):
        return None
    if _CONTROL.search(link) or "\\" in link or link.strip() != link:
        return None
    parts = urlsplit(link)
    # Must be an absolute URL on our own host (emitters always pass absolute).
    if parts.scheme not in ("http", "https") or parts.netloc != urlsplit(_ORIGIN).netloc:
        return None
    path = parts.path or "/"
    if path.startswith("//"):  # protocol-relative slipped through as path
        return None
    if path.startswith("/c/") or path == "/c":
        return None  # never shorten another /c code
    if not any(path == p or path.startswith(p + "/") or path == p for p in _ALLOWED_PREFIXES):
        return None
    # Keep the query (?week=N); drop any fragment.
    return urlunsplit(("", "", path, parts.query, ""))


def shorten(target_path: str, kind: str) -> str:
    """Idempotent per (target_path, kind): reuse the existing code or mint one
    (concurrency-safe under the per-member fan-out). Returns `/c/R<code>` code's
    absolute URL. Raises on DB error — callers treat that as best-effort."""
    row = RedirectLink.query.filter_by(target_path=target_path, kind=kind).first()
    if row is None:
        row = RedirectLink(code=_gen_code(), target_path=target_path, kind=kind)
        db.session.add(row)
        try:
            db.session.commit()
        except IntegrityError:
            # Lost a race (another recipient's send minted it, or a code clash) —
            # roll back and re-read the winner.
            db.session.rollback()
            row = RedirectLink.query.filter_by(target_path=target_path, kind=kind).first()
            if row is None:
                # Extremely unlikely (code PK clash, not the target/kind unique) —
                # retry once with a fresh code.
                row = RedirectLink(code=_gen_code(), target_path=target_path, kind=kind)
                db.session.add(row)
                db.session.commit()
    return f"{_ORIGIN}/c/{row.code}"


def maybe_shorten_link_context(context: dict, kind: str) -> dict:
    """Return a copy of `context` with `link` swapped for a `/c/R` shortlink when
    eligible; otherwise the same context. Never raises (best-effort)."""
    try:
        link = (context or {}).get("link")
        target = normalize_target(link) if link else None
        if not target:
            return context
        short = shorten(target, kind)
        return {**context, "link": short}
    except Exception:  # noqa: BLE001 — shortening must never block a send
        current_app.logger.exception("shorten failed kind=%s", kind)
        return context


# Codes are immutable, so caching code→(target, kind) is safe. Per-worker,
# bounded; a miss is a cheap DB read. (No redis in this service.)
_TARGET_CACHE: dict[str, tuple[str, str]] = {}
_TARGET_CACHE_MAX = 5000


def resolve_target(code: str) -> tuple[str, str] | None:
    """(target_path, kind) for a code, cached; None on miss (no row written)."""
    code = code or ""
    hit = _TARGET_CACHE.get(code)
    if hit is not None:
        return hit
    row = RedirectLink.query.filter_by(code=code).first()
    if row is None:
        return None
    if len(_TARGET_CACHE) >= _TARGET_CACHE_MAX:
        _TARGET_CACHE.clear()
    _TARGET_CACHE[code] = (row.target_path, row.kind)
    return _TARGET_CACHE[code]


def record_link_click(code: str, kind: str, *, user_id, ua, ip) -> None:
    """Log a `/c/R` tap. Best-effort — a failure still lets the caller redirect."""
    try:
        db.session.add(LinkClick(
            source="link", kind=kind, code=code,
            user_id=user_id, ua=(ua or "")[:512], ip=ip,
        ))
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception("click log failed code=%s", code)


def click_stats() -> dict:
    """Unified engagement counts per (kind, source) + distinct users — the A+B
    read. Union of `/c/R` taps (source='link') and in-app opens (source='inapp')."""
    from sqlalchemy import func

    rows = (
        db.session.query(
            LinkClick.kind, LinkClick.source,
            func.count().label("clicks"),
            func.count(func.distinct(LinkClick.user_id)).label("users"),
        )
        .group_by(LinkClick.kind, LinkClick.source)
        .all()
    )
    return {
        "stats": [
            {"kind": k, "source": s, "clicks": int(c), "users": int(u)}
            for (k, s, c, u) in rows
        ]
    }


def record_inapp_open(user_id, template_key, *, ua=None, ip=None) -> None:
    """Goal A: an in-app notification open. Fire-and-forget from the caller."""
    try:
        db.session.add(LinkClick(
            source="inapp", kind=template_key or "", user_id=user_id,
            ua=(ua or "")[:512], ip=ip,
        ))
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception("inapp open log failed user=%s", user_id)
