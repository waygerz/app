from flask import Blueprint
from flask_jwt_extended import jwt_required

from app.controllers import controller_profile as ctrl

profile_bp = Blueprint("profile", __name__)


@profile_bp.get("/profile")
@jwt_required()
def get_profile():
    return ctrl.get_profile()


@profile_bp.patch("/profile")
@jwt_required()
def update_profile():
    return ctrl.update_profile()


@profile_bp.patch("/profile/avatar")
@jwt_required()
def set_avatar():
    return ctrl.set_avatar()
