from flask import Blueprint

from app.controllers import controller_uploads as ctrl

uploads_bp = Blueprint("uploads", __name__)


@uploads_bp.post("/uploads/presign")
def presign():
    return ctrl.presign()


@uploads_bp.post("/uploads/<asset_id>/complete")
def complete(asset_id):
    return ctrl.complete(asset_id)


@uploads_bp.get("/uploads/<asset_id>")
def get_asset(asset_id):
    return ctrl.get_asset(asset_id)


@uploads_bp.delete("/uploads/<asset_id>")
def delete(asset_id):
    return ctrl.delete(asset_id)