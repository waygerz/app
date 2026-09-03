"""Service-to-service asset verification for comments/messaging."""
import logging

from app.extensions import db
from app.models.asset import ALLOWED_PURPOSES, STATUS_READY, Asset
from app.services.service_storage import StorageError, get_storage

logger = logging.getLogger(__name__)


def verify_assets(data: dict) -> tuple[dict, int]:
    user_id = str(data.get("user_id") or "")
    purpose = (data.get("purpose") or "").strip()
    raw_ids = data.get("asset_ids") or []

    if not user_id:
        return {"error": "user_id required"}, 400
    if purpose not in ALLOWED_PURPOSES:
        return {"error": "invalid purpose"}, 400
    if not isinstance(raw_ids, list) or not raw_ids:
        return {"error": "asset_ids required"}, 400
    if len(raw_ids) > 4:
        return {"error": "too many attachments"}, 400

    asset_ids = [str(i) for i in raw_ids]
    rows = Asset.query.filter(Asset.id.in_(asset_ids)).all()
    by_id = {str(r.id): r for r in rows}

    if len(by_id) != len(asset_ids):
        return {"error": "unknown asset"}, 400

    storage = get_storage()
    assets_out = []
    for aid in asset_ids:
        row = by_id[aid]
        if str(row.owner_id) != user_id:
            return {"error": "forbidden"}, 403
        if row.purpose != purpose:
            return {"error": "purpose mismatch"}, 400
        if row.status != STATUS_READY:
            return {"error": "asset not ready"}, 400
        url = storage.presign_get(bucket=row.s3_bucket, key=row.s3_key)
        assets_out.append(row.to_dict(download_url=url))

    return {"assets": assets_out}, 200


def purge_user(data: dict) -> tuple[dict, int]:
    """Account deletion in the media service: remove the user's owned assets.

    For each asset the DELETE ORDER is deliberate — the S3 object is deleted
    FIRST, then the DB row. S3 delete is idempotent (a missing key succeeds), so
    a retry is safe; deleting the row first and then failing the S3 call would
    orphan the object with no row left to find it from. If any object delete
    fails hard, we abort with 500 (leaving that row) so the orchestrator can
    retry — no row is dropped for an object that wasn't removed. Idempotent.
    """
    try:
        uid = str(data["user_id"])
    except (KeyError, ValueError, TypeError):
        return {"error": "user_id is required"}, 400

    storage = get_storage()
    rows = Asset.query.filter(Asset.owner_id == uid).all()
    deleted = 0
    for row in rows:
        try:
            storage.delete_object(bucket=row.s3_bucket, key=row.s3_key)
        except StorageError:
            logger.exception("purge: S3 delete failed asset=%s", row.id)
            db.session.rollback()
            return {"error": "storage delete failed", "deleted": deleted}, 500
        db.session.delete(row)
        deleted += 1
    db.session.commit()
    return {"purged": {"assets": deleted}}, 200