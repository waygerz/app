from flask import Flask

from app.utils.config import Config
from app.extensions import init_redis


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Fail fast on missing prod config: without the https base every callback URL
    # becomes "None/voice/…" (callbacks + validation break silently); without the
    # auth token RequestValidator("") 403s every webhook; without a from-number the
    # outbound Dial/SMS go out with an empty caller_id/from. Only enforced when
    # validation is on, so local dev (validation off) still runs on dummies.
    if app.config["TWILIO_VALIDATE_SIGNATURE"]:
        base = app.config["TWILIO_WEBHOOK_BASE_URL"]
        if not base or not base.startswith("https://"):
            raise RuntimeError(
                "TWILIO_WEBHOOK_BASE_URL must be set to the https public base "
                "(e.g. https://waygerz.com/v1/platform/twilio) when "
                "TWILIO_VALIDATE_SIGNATURE is on"
            )
        missing = [
            k for k in ("TWILIO_AUTH_TOKEN", "TWILIO_ACCOUNT_SID", "TWILIO_FROM")
            if not app.config.get(k)
        ]
        if missing:
            raise RuntimeError(
                f"missing required Twilio config {missing} when "
                "TWILIO_VALIDATE_SIGNATURE is on"
            )

    # Validate the FORWARD_TO roster at boot: non-empty and within the cap, so a
    # misconfigured roster is a startup error, not a silent runtime surprise.
    roster = Config.forward_to()
    if not roster:
        app.logger.warning("FORWARD_TO is empty — calls/texts have nowhere to go")
    elif len(roster) > app.config["FORWARD_MAX"]:
        raise RuntimeError(
            f"FORWARD_TO has {len(roster)} numbers, over FORWARD_MAX="
            f"{app.config['FORWARD_MAX']}; raise the cap or trim the roster"
        )

    init_redis(app)

    from app.routes import register_blueprints
    register_blueprints(app)

    return app
