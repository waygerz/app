from flask import Blueprint, current_app, jsonify

from app.utils.config import Config

from app.routes.route_cricket import ingestor_cricket_bp
from app.routes.route_events import ingestor_events_bp
from app.routes.route_golf import ingestor_golf_bp
from app.routes.route_internal import ingestor_internal_bp
from app.routes.route_mma import ingestor_mma_bp
from app.routes.route_racing import ingestor_racing_bp
from app.routes.route_sports import ingestor_sports_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)


@service_bp.get("/health")
def health():
    return jsonify(status="ok", service=current_app.config["SERVICE_NAME"], version=current_app.config["GIT_SHA"])


for bp in [
    ingestor_events_bp,
    ingestor_sports_bp,
    ingestor_golf_bp,
    ingestor_racing_bp,
    ingestor_mma_bp,
    ingestor_cricket_bp,
]:
    service_bp.register_blueprint(bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())
    app.register_blueprint(ingestor_internal_bp, url_prefix=Config.api_prefix() + "/internal")
