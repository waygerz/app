from flask import Blueprint

from app.utils.config import Config

from app.routes.route_health import messaging_health_bp
from app.routes.route_messaging import messaging_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)

for bp in [messaging_health_bp, messaging_bp]:
    service_bp.register_blueprint(bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())