from flask import Blueprint, current_app, jsonify

from app.utils.config import Config

from app.routes.route_feed import notifications_feed_bp
from app.routes.route_internal import notifications_internal_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)


@service_bp.get("/health")
def health():
    return jsonify(status="ok", service=current_app.config["SERVICE_NAME"], version=current_app.config["GIT_SHA"])


for bp in [
    notifications_feed_bp,
]:
    service_bp.register_blueprint(bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())
    app.register_blueprint(notifications_internal_bp, url_prefix=Config.api_prefix() + "/internal")
