from flask import Blueprint

from app.utils.config import Config

from app.routes.route_auth import auth_bp
from app.routes.route_health import auth_health_bp
from app.routes.route_internal import auth_internal_bp
from app.routes.route_logout import logout_bp
from app.routes.route_refresh import refresh_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)

for bp in [
    auth_health_bp,
    auth_bp,
    refresh_bp,
    logout_bp,
]:
    service_bp.register_blueprint(bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())
    app.register_blueprint(auth_internal_bp, url_prefix=Config.api_prefix() + "/internal")