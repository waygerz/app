"""Presigned upload lifecycle for comment/message attachments."""
from datetime import datetime

from flask import current_app

from app.extensions import db
from app.models.asset import ALLOWED_PURPOSES, STATUS_DELETED, STATUS_PENDING, STATUS_READY, Asset
from app.services.service_storage import StorageError, get_storage, verify_object
from app.utils.mime import ALLOWED_CONTENT_TYPES, extension_for, max_bytes_for


def _bucket() -> str:
    return current_app.config["S3_BUCKET"]


def _s3_key(owner_id: str, asset_id: str, content_type: str) -> str:
    ext = extension_for(content_type)
    return f"uploads/{owner_id}/{asset_id}{ext}"


def presign_upload(owner_id: str, data: dict) -> tuple[dict, int]:
    purpose = (data.get("purpose") or "").strip()
    content_type = (data.get("content_type") or "").strip().lower()
    try:
        byte_size = int(data.get("byte_size") or 0)
    except (TypeError, ValueError):
        byte_size = 0

    if purpose not in ALLOWED_PURPOSES:
        return {"error": "invalid purpose"}, 400
    if content_type not in ALLOWED_CONTENT_TYPES:
        return {"error": "unsupported content type"}, 400
    if byte_size <= 0:
        return {"error": "byte_size required"}, 400

    limit = max_bytes_for(
        content_type,
        image_limit=current_app.config["MEDIA_MAX_IMAGE_BYTES"],
        gif_limit=current_app.config["MEDIA_MAX_GIF_BYTES"],
    )
    if byte_size > limit:
        return {"error": "file too large"}, 400

    asset = Asset(
        owner_id=str(owner_id),
        purpose=purpose,
        s3_bucket=_bucket(),
        s3_key="pending",
        content_type=content_type,
        byte_size=byte_size,
        status=STATUS_PENDING,
    )
    db.session.add(asset)
    db.session.flush()
    asset.s3_key = _s3_key(str(owner_id), str(asset.id), content_type)
    db.session.commit()

    storage = get_storage()
    presign = storage.presign_put(
        bucket=asset.s3_bucket,
        key=asset.s3_key,
        content_type=content_type,
        byte_size=byte_size,
    )
    body = {
        "asset": asset.to_dict(),
        **presign,
        "expires_in": current_app.config["MEDIA_PRESIGN_PUT_TTL"],
    }
    return body, 201


def complete_upload(owner_id: str, asset_id: str) -> tuple[dict, int]:
    asset = db.session.get(Asset, asset_id)
    if not asset or asset.status == STATUS_DELETED:
        return {"error": "asset not found"}, 404
    if str(asset.owner_id) != str(owner_id):
        return {"error": "forbidden"}, 403
    if asset.status == STATUS_READY:
        storage = get_storage()
        url = storage.presign_get(bucket=asset.s3_bucket, key=asset.s3_key)
        return {"asset": asset.to_dict(download_url=url)}, 200

    storage = get_storage()
    try:
        verify_object(storage, asset=asset, declared_type=asset.content_type)
    except StorageError as exc:
        return {"error": str(exc)}, 400

    asset.status = STATUS_READY
    asset.ready_at = datetime.utcnow()
    db.session.commit()

    url = storage.presign_get(bucket=asset.s3_bucket, key=asset.s3_key)
    return {"asset": asset.to_dict(download_url=url)}, 200


def get_upload(owner_id: str, asset_id: str) -> tuple[dict, int]:
    asset = db.session.get(Asset, asset_id)
    if not asset or asset.status == STATUS_DELETED:
        return {"error": "asset not found"}, 404
    if str(asset.owner_id) != str(owner_id):
        return {"error": "forbidden"}, 403
    if asset.status != STATUS_READY:
        return {"error": "asset not ready"}, 409

    storage = get_storage()
    url = storage.presign_get(bucket=asset.s3_bucket, key=asset.s3_key)
    return {"asset": asset.to_dict(download_url=url)}, 200


def delete_upload(owner_id: str, asset_id: str) -> tuple[dict, int]:
    asset = db.session.get(Asset, asset_id)
    if not asset or asset.status == STATUS_DELETED:
        return {"error": "asset not found"}, 404
    if str(asset.owner_id) != str(owner_id):
        return {"error": "forbidden"}, 403

    asset.status = STATUS_DELETED
    db.session.commit()
    return {"message": "deleted"}, 200