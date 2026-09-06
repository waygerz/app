import click
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

    @app.cli.command("dump-league-sports")
    @click.argument("query")
    def dump_league_sports(query):
        """Read-only: print the configured sports for leagues matching QUERY
        (an id or a case-insensitive name substring). Reads this service's own
        schema — safe to run as a one-off. Used to diagnose Upcoming scoping."""
        from app.models.league import League
        from app.models.sport import LeagueSport

        q = (query or "").strip()
        leagues = League.query.filter(
            db.or_(League.id == q, League.name.ilike(f"%{q}%"))
        ).all()
        if not leagues:
            print(f"no leagues match {q!r}", flush=True)
            return
        for lg in leagues:
            sports = LeagueSport.query.filter_by(league_id=lg.id).all()
            print(f"\nleague {lg.id}  {lg.name!r}  type={lg.league_type} status={lg.status}", flush=True)
            print(f"  sports ({len(sports)}):", flush=True)
            for s in sports:
                print(f"    - {s.sport_league_id}  {s.name!r}", flush=True)

    return app