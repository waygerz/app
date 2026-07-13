import os
from datetime import timedelta


def _bool(value, default=False):
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


class Config:
    SERVICE_GROUP = os.environ.get("SERVICE_GROUP", "platform")
    SERVICE_NAME = os.environ.get("SERVICE_NAME", "ingestor")
    APP_ENV = os.environ.get("APP_ENV", "development")
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg2://waygerz:waygerz@pgsql:5432/waygerz",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # This service owns its own Postgres schema. Pin the connection's search_path
    # to it so models + the alembic version table live in this schema cleanly.
    DB_SCHEMA = os.environ.get("DB_SCHEMA", "ingestor")
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"options": f"-csearch_path={DB_SCHEMA}"}
    }

    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-jwt-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        seconds=int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRES", 60 * 60 * 24 * 7))
    )

    REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")

    # ---- Sports API (realtimesportsapi.com) -------------------------------
    SPORTS_API_KEY = os.environ.get("SPORTS_API_KEY", "")
    SPORTS_API_BASE = os.environ.get(
        "SPORTS_API_BASE", "https://realtimesportsapi.com/api/v1"
    )
    # Mock mode serves seeded fixtures instead of calling the API (protects quota).
    SPORTS_API_MOCK = _bool(os.environ.get("SPORTS_API_MOCK"), default=True)
    # Short-TTL Redis cache for raw API responses (seconds).
    SPORTS_CACHE_TTL = int(os.environ.get("SPORTS_CACHE_TTL", 15))
    # Odds move fast and are fetched per-event on demand, so cache them briefly.
    SPORTS_ODDS_TTL = int(os.environ.get("SPORTS_ODDS_TTL", 5))
    # Stop calling the API once our tracked monthly remaining hits this floor.
    SPORTS_QUOTA_FLOOR = int(os.environ.get("SPORTS_QUOTA_FLOOR", 5))

    DEFAULT_SPORT = os.environ.get("DEFAULT_SPORT", "basketball")
    DEFAULT_LEAGUE = os.environ.get("DEFAULT_LEAGUE", "nba")

    # ---- ESPN public API (free) — covers what RealTimeSportsAPI can't: field
    # sports (golf, racing), 1v1 (mma), and sports RTS lacks (cricket). Redis-only
    # cache-aside, flat freshness window (serve cached; older than TTL -> refetch).
    ESPN_BASE = os.environ.get("ESPN_BASE", "https://site.api.espn.com/apis/site/v2/sports")
    ESPN_CACHE_TTL = int(os.environ.get("ESPN_CACHE_TTL", 600))  # 10 minutes
    ESPN_TIMEOUT = int(os.environ.get("ESPN_TIMEOUT", 8))  # seconds; serve stale/empty on timeout
    # Team-sport schedule ingest (service_schedule): how far ahead date-based
    # sports pull fixtures, and how often the scheduler tick actually re-hits ESPN
    # for fixtures (weekly) vs live scores (5 min).
    SCHEDULE_WEEKS_AHEAD = int(os.environ.get("SCHEDULE_WEEKS_AHEAD", 6))
    SCHEDULE_FIXTURE_TTL = int(os.environ.get("SCHEDULE_FIXTURE_TTL", 604800))  # 7 days
    SCHEDULE_SCORE_TTL = int(os.environ.get("SCHEDULE_SCORE_TTL", 300))  # 5 minutes
    # Leagues/tours per ESPN sport (slug lists).
    GOLF_TOURS = [t.strip() for t in os.environ.get("GOLF_TOURS", "pga").split(",") if t.strip()]
    RACING_TOURS = [
        t.strip() for t in os.environ.get("RACING_TOURS", "f1,nascar-premier,irl").split(",") if t.strip()
    ]
    MMA_TOURS = [t.strip() for t in os.environ.get("MMA_TOURS", "ufc,pfl").split(",") if t.strip()]
    # ESPN cricket has no leagues-list endpoint — league IDs are numeric + curated
    # (verified via scan): 8039 World Cup, 8048 IPL, 8044 Big Bash, 8037 Champions
    # Trophy, 8040 T20 WC Qualifier, 8041 SuperSport, 8043 Sheffield Shield, 8050 Ranji.
    CRICKET_LEAGUES = [
        t.strip()
        for t in os.environ.get("CRICKET_LEAGUES", "8039,8048,8044,8037,8040,8041,8043,8050").split(",")
        if t.strip()
    ]

    # ---- Sport logo caching (S3 public/sports/) --------------------------
    # Mirror external team/league logos into our own bucket so we stop hotlinking
    # ESPN and can serve them from a CDN. Off in dev by default (no AWS); on in
    # prod. See _docs/S3_LAYOUT.md.
    AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
    ASSET_S3_BUCKET = os.environ.get("AWS_S3_BUCKET", "waygerz")
    # Public base for cached assets — swap to https://cdn.waygerz.com once CloudFront lands.
    ASSET_PUBLIC_BASE = os.environ.get(
        "ASSET_PUBLIC_BASE", "https://waygerz.s3.us-east-1.amazonaws.com"
    )
    LOGO_CACHE_ENABLED = _bool(
        os.environ.get("LOGO_CACHE_ENABLED"),
        default=(os.environ.get("APP_ENV", "development") == "production"),
    )

    # Shared secret for service-to-service (internal) calls, e.g. event refresh.
    INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token")

    @classmethod
    def api_prefix(cls) -> str:
        return f"/v1/{cls.SERVICE_GROUP}/{cls.SERVICE_NAME}"