from flask import Flask
from sqlalchemy import text

from app.utils.config import Config
from app.extensions import cors, db, migrate


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
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

    return app