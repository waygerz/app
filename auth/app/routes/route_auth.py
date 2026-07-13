from flask import Blueprint

from app.controllers import controller_auth as ctrl

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/otp/start")
def otp_start():
    return ctrl.otp_start()


@auth_bp.post("/otp/verify")
def otp_verify():
    return ctrl.otp_verify()


@auth_bp.post("/otp/complete")
def otp_complete():
    return ctrl.otp_complete()


@auth_bp.get("/me")
def me():
    return ctrl.me()


@auth_bp.patch("/me")
def update_me():
    return ctrl.update_me()


@auth_bp.patch("/me/avatar")
def set_avatar():
    return ctrl.set_avatar()
