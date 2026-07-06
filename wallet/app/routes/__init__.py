from flask import Blueprint

from app.utils.config import Config

from app.routes.route_health import wallet_health_bp
from app.routes.route_internal import wallet_internal_bp
from app.routes.route_wallet import wallet_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)

for bp in [
    wallet_health_bp,
    wallet_bp,
]:
    service_bp.register_blueprint(bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())
    app.register_blueprint(wallet_internal_bp, url_prefix=Config.api_prefix() + "/internal")