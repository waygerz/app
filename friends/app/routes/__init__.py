from flask import Blueprint

from app.utils.config import Config

from app.routes.route_friends import friends_bp
from app.routes.route_health import friends_health_bp
from app.routes.route_internal import friends_internal_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)

for bp in [
    friends_health_bp,
    friends_bp,
]:
    service_bp.register_blueprint(bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())
    app.register_blueprint(friends_internal_bp, url_prefix="/internal")