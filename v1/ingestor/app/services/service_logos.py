"""Mirror external sport logos into our S3 bucket (public/sports/).

Best-effort and memoized: the first time a source logo URL is seen we download
it and PUT it to `public/sports/<hash>.<ext>` (world-readable via the bucket
policy), remember the mapping in Redis, and return our URL. Every failure falls
back to the original URL, so logos never break.

Callers store the returned URL in the DB row, so in steady state this does no
network work — reads just emit the stored S3 URL.
"""
import hashlib

import requests
from flask import current_app

from app.extensions import get_redis

_MEMO_TTL = 30 * 24 * 3600  # 30 days
_MEMO_PREFIX = "logo:src:"
_CT_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/gif": "gif",
}
_OK_EXT = {"png", "jpg", "jpeg", "webp", "svg", "gif"}


def _client():
    import boto3

    return boto3.client("s3", region_name=current_app.config["AWS_REGION"])


def _ext_for(content_type: str, url: str) -> str:
    ext = _CT_EXT.get(content_type)
    if ext:
        return ext
    tail = url.rsplit("/", 1)[-1]
    if "." in tail:
        cand = tail.rsplit(".", 1)[-1].split("?")[0].lower()
        if cand in _OK_EXT:
            return cand
    return "png"


def cache_logo(url):
    """Return a URL to our cached copy of `url`, or `url` itself on any miss."""
    if not url or not current_app.config.get("LOGO_CACHE_ENABLED"):
        return url
    base = current_app.config["ASSET_PUBLIC_BASE"]
    if url.startswith(base):
        return url  # already one of ours

    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:20]
    memo_key = _MEMO_PREFIX + digest
    try:
        r = get_redis()
        hit = r.get(memo_key)
        if hit:
            return hit.decode() if isinstance(hit, (bytes, bytearray)) else hit

        resp = requests.get(url, timeout=6)
        if resp.status_code != 200 or not resp.content:
            return url
        content_type = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        ext = _ext_for(content_type, url)
        key = f"public/sports/{digest}.{ext}"
        _client().put_object(
            Bucket=current_app.config["ASSET_S3_BUCKET"],
            Key=key,
            Body=resp.content,
            ContentType=content_type or "image/png",
            CacheControl="public, max-age=31536000, immutable",
        )
        cached_url = f"{base}/{key}"
        r.set(memo_key, cached_url, ex=_MEMO_TTL)
        return cached_url
    except Exception:  # noqa: BLE001 — logos are best-effort; never break the response
        return url
