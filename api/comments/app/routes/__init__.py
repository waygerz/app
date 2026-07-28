from flask import Blueprint

from app.utils.config import Config

from app.routes.route_comments import comments_bp
from app.routes.route_health import comments_health_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)

for bp in [comments_health_bp, comments_bp]:
    service_bp.register_blueprint(bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())