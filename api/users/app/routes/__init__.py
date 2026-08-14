from flask import Blueprint, current_app, jsonify

from app.utils.config import Config

from app.routes.route_internal import users_internal_bp
from app.routes.route_profile import profile_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)


@service_bp.get("/health")
def health():
    return jsonify(status="ok", service=current_app.config["SERVICE_NAME"], version=current_app.config["GIT_SHA"])


for bp in [
    profile_bp,
]:
    service_bp.register_blueprint(bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())
    app.register_blueprint(users_internal_bp, url_prefix=Config.api_prefix() + "/internal")
