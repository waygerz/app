from flask import Blueprint

from app.utils.config import Config

from app.routes.route_health import leagues_health_bp
from app.routes.route_internal import leagues_internal_bp
from app.routes.route_leagues import leagues_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)

for bp in [
    leagues_health_bp,
    leagues_bp,
]:
    service_bp.register_blueprint(bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())
    app.register_blueprint(leagues_internal_bp, url_prefix=Config.api_prefix() + "/internal")