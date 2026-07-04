"""Service-to-service asset verification for comments/messaging."""
from app.extensions import db
from app.models.asset import ALLOWED_PURPOSES, STATUS_READY, Asset
from app.services.service_storage import get_storage


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