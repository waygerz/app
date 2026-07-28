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
    cors.init_app(
        app,
        resources={r"/*": {"origins": app.config["CORS_ALLOWED_ORIGINS"], "supports_credentials": True}},
    )

    from app import models  # noqa: F401
    from app.routes import register_blueprints

    register_blueprints(app)

    @app.cli.command("init-schema")
    def init_schema():
        schema = app.config["DB_SCHEMA"]
        db.session.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        db.session.commit()
        print(f"schema ready: {schema}")

    return app