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
        import uuid as _uuid

        from app.models.league import League
        from app.models.sport import LeagueSport

        q = (query or "").strip()
        # id is a UUID column — only compare it when the query IS a uuid, else
        # Postgres rejects the cast. Otherwise match on the name substring.
        conds = [League.name.ilike(f"%{q}%")]
        try:
            _uuid.UUID(q)
            conds.insert(0, League.id == q)
        except ValueError:
            pass
        leagues = League.query.filter(db.or_(*conds)).all()
        if not leagues:
            print(f"no leagues match {q!r}", flush=True)
            return
        for lg in leagues:
            sports = LeagueSport.query.filter_by(league_id=lg.id).all()
            print(f"\nleague {lg.id}  {lg.name!r}  type={lg.league_type} status={lg.status}", flush=True)
            print(f"  sports ({len(sports)}):", flush=True)
            for s in sports:
                print(f"    - {s.sport_league_id}  {s.name!r}", flush=True)

    @app.cli.command("send-pickem-week")
    @click.argument("query")
    @click.option("--send", is_flag=True, help="Actually deliver (default is a dry-run report).")
    @click.option("--force", is_flag=True, help="Bypass dedup so it delivers even if already sent.")
    def send_pickem_week(query, send, force):
        """Report — and with --send, deliver — the pick'em 'week' notification
        (last week's result + the new week opening) to every active member of the
        pick'em league matching QUERY (id or name substring). Dry-run by default;
        it verifies the finished week is FULLY GRADED before it can name a winner,
        and refuses to send an ungraded result."""
        import uuid as _uuid
        from datetime import datetime as _dt

        from app.models.league import League
        from app.models.member import LeagueMember
        from app.models.period import LeaguePeriod
        from app.models.pick import Pick
        from app.models import period as period_model
        from app.services import service_leagues as svc

        q = (query or "").strip()
        conds = [League.name.ilike(f"%{q}%")]
        try:
            _uuid.UUID(q)
            conds.insert(0, League.id == q)
        except ValueError:
            pass
        leagues = League.query.filter(db.or_(*conds)).all()
        if not leagues:
            print(f"no leagues match {q!r}", flush=True)
            return
        for lg in leagues:
            print(f"\nleague {lg.id}  {lg.name!r}  type={lg.league_type} status={lg.status}", flush=True)
            if lg.league_type != "pickem":
                print("  SKIP — not a pick'em league", flush=True)
                continue
            finalized = (
                LeaguePeriod.query.filter_by(league_id=lg.id, status=period_model.FINAL)
                .order_by(LeaguePeriod.index.desc()).first()
            )
            opened = LeaguePeriod.query.filter_by(league_id=lg.id, status=period_model.OPEN).first()
            members = LeagueMember.query.filter_by(league_id=lg.id, status=svc.ACTIVE).count()
            print(f"  finalized week: {finalized.label if finalized else None}", flush=True)
            print(f"  opened week:    {opened.label if opened else None}", flush=True)
            print(f"  active members: {members}", flush=True)
            if finalized is None:
                print("  ✗ no finished week — nothing to report as a result.", flush=True)
                continue
            ungraded = Pick.query.filter(
                Pick.period_id == str(finalized.id),
                Pick.correct.is_(None),
                Pick.voided.is_(False),
            ).count()
            # Grading is a pure DB check (no result left ungraded) — reliable even
            # from a one-off task. The winner line + the actual send need the
            # ingestor/users/notifications mesh, which a one-off task can't reach,
            # so --send must run from within the mesh (the running service).
            graded = ungraded == 0
            print(f"  {finalized.label}: {ungraded} ungraded pick(s) -> "
                  f"{'FULLY GRADED' if graded else 'NOT fully graded'}", flush=True)
            winner = None
            try:
                winner = svc._period_final_body(lg.id, finalized)
            except Exception as e:  # noqa: BLE001 — mesh unreachable from a one-off task
                print(f"  winner line: unavailable here ({type(e).__name__})", flush=True)
            else:
                print(f"  winner line: {winner!r}", flush=True)
                print(f"  message: {svc._pickem_week_headline(lg, finalized, opened, winner)!r}", flush=True)
            if not graded:
                print("  ✗ week not fully graded — do not send yet.", flush=True)
                continue
            if not send:
                print("  (dry-run — pass --send to deliver)", flush=True)
                continue
            suffix = _dt.utcnow().strftime("%Y%m%d%H%M%S") if force else ""
            svc._notify_pickem_week(lg, finalized=finalized, opened=opened,
                                    winner_line=winner, dedup_suffix=suffix)
            print(f"  ✓ sent to {members} member(s).", flush=True)

    return app