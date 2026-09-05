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

    @app.cli.command("backfill-feed-scores")
    def backfill_feed_scores():
        """One-off: re-post every already-decided wager so its league-feed
        'Bet result' row gains the game data (matchup + final score) in meta.
        Idempotent — the feed post upserts by dedup_key, so re-running only
        refreshes meta. Safe to run repeatedly."""
        from app.models.wager import Wager, COMPLETED, SETTLED
        from app.services import service_wagers as svc
        rows = (
            Wager.query.filter(
                Wager.winner_user_id.isnot(None),
                Wager.status.in_([COMPLETED, SETTLED]),
            )
            .order_by(Wager.created_at.asc())
            .all()
        )
        done = 0
        for w in rows:
            try:
                svc._post_completed_activity(w)
                done += 1
            except Exception as exc:  # noqa: BLE001
                print(f"  skip {w.id}: {exc}", flush=True)
        print(f"backfilled {done}/{len(rows)} decided wagers into the feed", flush=True)

    return app