from flask import Blueprint

from app.utils.config import Config

from app.routes.route_events import ingestor_events_bp
from app.routes.route_health import ingestor_health_bp
from app.routes.route_internal import ingestor_internal_bp
from app.routes.route_sports import ingestor_sports_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)

for bp in [
    ingestor_health_bp,
    ingestor_events_bp,
    ingestor_sports_bp,
]:
    service_bp.register_blueprint(bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())
    app.register_blueprint(ingestor_internal_bp, url_prefix="/internal")