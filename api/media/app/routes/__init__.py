from flask import Blueprint, jsonify

from app.utils.config import Config

from app.routes.route_internal import internal_bp
from app.routes.route_uploads import uploads_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)


@service_bp.get("/health")
def health():
    return jsonify(
        {
            "service": Config.SERVICE_NAME,
            "status": "ok",
            "version": Config.GIT_SHA,
            "media_mock": Config.MEDIA_MOCK,
        }
    )


for bp in [uploads_bp]:
    service_bp.register_blueprint(bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())
    app.register_blueprint(internal_bp, url_prefix=Config.api_prefix() + "/internal")
