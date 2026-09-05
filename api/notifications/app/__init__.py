from flask import Flask
from sqlalchemy import text

from app.utils.config import Config
from app.extensions import cors, db, jwt, migrate


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/*": {"origins": "*"}})

    from app import models  # noqa: F401
    from app.routes import register_blueprints

    register_blueprints(app)

    @app.cli.command("init-schema")
    def init_schema():
        schema = app.config["DB_SCHEMA"]
        db.session.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        db.session.commit()
        print(f"schema ready: {schema}")

    @app.cli.command("seed-templates")
    def seed_templates():
        """Insert the starter SMS template catalog (idempotent by key/version)."""
        from app.models.template import NotificationTemplate, STARTER_TEMPLATES
        for key, _category, body in STARTER_TEMPLATES:
            exists = NotificationTemplate.query.filter_by(key=key, channel="sms", version=1).first()
            if not exists:
                db.session.add(NotificationTemplate(key=key, body=body))
        db.session.commit()
        print(f"seeded {len(STARTER_TEMPLATES)} templates")

    @app.cli.command("enable-all-sms")
    def enable_all_sms():
        """Turn SMS on for EVERY user: lift the account-level SMS master
        (opted_out) and drop any per-category SMS opt-out rows so the on-by-
        default alert categories deliver again. For test data / all-consenting
        users only — never override real users' SMS consent."""
        from app.models.preference import NotificationPreference
        from app.models.channel_pref import NotificationChannelPref
        lifted = NotificationPreference.query.filter_by(opted_out=True).update(
            {NotificationPreference.opted_out: False}, synchronize_session=False
        )
        removed = NotificationChannelPref.query.filter_by(channel="sms", enabled=False).delete(
            synchronize_session=False
        )
        db.session.commit()
        print(f"SMS enabled for all: lifted {lifted} opted_out flags, removed {removed} sms opt-out rows", flush=True)

    return app