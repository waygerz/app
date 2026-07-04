from flask import Blueprint

from app.utils.config import Config

from app.routes.route_health import contests_health_bp
from app.routes.route_internal import contests_internal_bp
from app.routes.route_pools import pools_bp
from app.routes.route_wagers import wagers_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)

for bp in [
    contests_health_bp,
    wagers_bp,
    pools_bp,
]:
    service_bp.register_blueprint(bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())
    app.register_blueprint(contests_internal_bp, url_prefix="/internal")