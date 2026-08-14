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

    @app.cli.command("backfill-profiles")
    def backfill_profiles():
        """One-off: copy display_name/avatar_key from auth.users into
        users.profiles (idempotent, safe to re-run). This cross-schema READ of
        auth.users is acceptable for a one-time backfill only; runtime code must
        never cross-query another service's schema."""
        schema = app.config["DB_SCHEMA"]
        rows = db.session.execute(
            text("SELECT id, display_name, avatar_key, created_at FROM auth.users")
        ).fetchall()
        n = 0
        for r in rows:
            db.session.execute(
                text(
                    f'INSERT INTO "{schema}".profiles '
                    "(user_id, display_name, avatar_key, created_at, updated_at) "
                    "VALUES (:id, :dn, :ak, :ca, now()) "
                    "ON CONFLICT (user_id) DO UPDATE SET "
                    "display_name = EXCLUDED.display_name, "
                    "avatar_key = EXCLUDED.avatar_key, updated_at = now()"
                ),
                {"id": r.id, "dn": r.display_name, "ak": r.avatar_key, "ca": r.created_at},
            )
            n += 1
        db.session.commit()
        print(f"backfilled {n} profiles")

    return app
