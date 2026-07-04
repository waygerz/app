from flask import Blueprint

from app.controllers import controller_auth as ctrl

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/signup/start")
def signup_start():
    return ctrl.signup_start()


@auth_bp.post("/signup/verify")
def signup_verify():
    return ctrl.signup_verify()


@auth_bp.post("/login")
def login():
    return ctrl.login()


@auth_bp.get("/me")
def me():
    return ctrl.me()