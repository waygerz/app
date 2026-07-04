import click
from flask import Flask
from sqlalchemy import text

from app.utils.config import Config
from app.extensions import cors, db, init_redis, jwt, migrate


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
    init_redis(app)

    from app import models  # noqa: F401  (register models on metadata)
    from app.routes import register_blueprints

    register_blueprints(app)

    @app.cli.command("init-schema")
    def init_schema():
        """Create this service's Postgres schema if it doesn't exist."""
        schema = app.config["DB_SCHEMA"]
        db.session.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        db.session.commit()
        print(f"schema ready: {schema}")

    @app.cli.command("create-user")
    @click.argument("phone")
    @click.argument("pin")
    @click.option("--name", default="Player", help="Display name")
    def create_user(phone, pin, name):
        """Create a user directly (bypasses OTP); PIN is hashed properly."""
        from app.models.user import User
        from app.services.service_auth import InvalidPhone, hash_pin, normalize_phone

        try:
            phone = normalize_phone(phone)
        except InvalidPhone:
            print(f"invalid phone number: {phone!r}")
            raise SystemExit(1)

        existing = User.query.filter_by(phone=phone).first()
        if existing:
            print(f"phone {phone} already exists (id={existing.id})")
            return
        user = User(phone=phone, pin_hash=hash_pin(pin), display_name=name)
        db.session.add(user)
        db.session.commit()
        print(f"created user id={user.id} phone={phone} name={name!r}")

    return app