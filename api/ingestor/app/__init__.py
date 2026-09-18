from datetime import datetime

import click
from flask import Flask
from sqlalchemy import text

from app.utils.config import Config
from app.utils.guards import require_prod_secrets
from app.extensions import cors, db, init_redis, jwt, migrate


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    require_prod_secrets(app)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/*": {"origins": "*"}})
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

    @app.cli.command("db-stats")
    def db_stats():
        """Postgres connection budget: max_connections and who holds what."""
        limit = db.session.execute(text("SHOW max_connections")).scalar()
        rows = db.session.execute(text(
            "SELECT coalesce(nullif(application_name, ''), usename, '?') AS who, "
            "state, count(*) FROM pg_stat_activity WHERE datname = current_database() "
            "GROUP BY 1, 2 ORDER BY 3 DESC"
        )).all()
        print(f"max_connections={limit} in_use={sum(r[2] for r in rows)}")
        for who, state, n in rows:
            print(f"  {who:<16} {state or '-':<22} {n}")

    @app.cli.command("quota")
    def quota():
        """Print every data provider's budget, usage and pace."""
        import json

        from app.services.service_quota import report

        print(json.dumps(report(), indent=2))

    @app.cli.command("rescore")
    @click.option("--since", required=True, help="First day to re-read, YYYY-MM-DD (UTC).")
    @click.option("--until", default=None, help="Last day, YYYY-MM-DD (default: today).")
    def rescore(since, until):
        """Re-read ESPN boards for a date range and overwrite stored results."""
        from app.services.service_schedule import rescore_dates

        start = datetime.strptime(since, "%Y-%m-%d").date()
        end = datetime.strptime(until, "%Y-%m-%d").date() if until else datetime.utcnow().date()
        result = rescore_dates(start, end)
        failed = result.pop("failed")
        for league, n in result.items():
            print(f"rescored {league}: {n} events")
        if failed:
            # Non-zero so the deploy workflow's one-off step fails loudly.
            raise click.ClickException(f"{len(failed)} league-days failed: {', '.join(failed)}")

    return app