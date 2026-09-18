from datetime import datetime

import click
from flask import Flask
from sqlalchemy import text

from app.utils.config import Config
from app.utils.guards import require_prod_secrets
from app.extensions import cors, db, jwt, migrate


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    require_prod_secrets(app)

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

    @app.cli.command("resettle-refunds")
    @click.option("--since", required=True, help="Refunds settled at/after this UTC date, YYYY-MM-DD.")
    @click.option("--apply", is_flag=True, help="Move money. Without it, only report.")
    @click.option("--ingestor-url", default=None,
                  help="Read events here instead of the mesh (one-off tasks run outside "
                       "Service Connect), e.g. https://waygerz.com/v1/platform/ingestor.")
    def resettle_refunds(since, apply, ingestor_url):
        """Settle wagers refunded as a push on a result that was later corrected."""
        from app.services.service_wagers import resettle_refunds as run

        if ingestor_url:
            app.config["INGESTOR_URL"] = ingestor_url.rstrip("/")
        rows = run(datetime.strptime(since, "%Y-%m-%d"), apply=apply)
        for r in rows:
            print(" ".join(f"{k}={v}" for k, v in r.items()), flush=True)
        print(f"{'applied' if apply else 'dry run'}: {len(rows)} refunded wagers checked", flush=True)

    return app