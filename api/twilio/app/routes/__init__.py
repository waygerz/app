from flask import Blueprint, current_app, jsonify

from app.utils.config import Config
from app.routes.route_webhooks import twilio_webhooks_bp

service_bp = Blueprint(Config.SERVICE_NAME, __name__)


@service_bp.get("/health")
def health():
    # Deliberately NOT signature-guarded: the ALB health check calls this with no
    # Twilio signature. A blanket guard would 403 it, mark the target unhealthy,
    # and the service would never register.
    return jsonify(
        status="ok",
        service=current_app.config["SERVICE_NAME"],
        version=current_app.config["GIT_SHA"],
    )


service_bp.register_blueprint(twilio_webhooks_bp)


def register_blueprints(app):
    app.register_blueprint(service_bp, url_prefix=Config.api_prefix())
