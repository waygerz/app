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

    # Shared secret for service-to-service (internal) calls, e.g. event refresh.
    INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token")

    @classmethod
    def api_prefix(cls) -> str:
        return f"/v1/{cls.SERVICE_GROUP}/{cls.SERVICE_NAME}"