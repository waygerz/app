"""Shared Flask extensions for the ingestor service.

The service's Postgres schema is selected via the connection ``search_path``
(see Config.SQLALCHEMY_ENGINE_OPTIONS), so models stay schema-agnostic and the
alembic version table lands in the right schema automatically.
"""
import redis as redis_lib
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()

_redis = None


def init_redis(app):
    global _redis
    _redis = redis_lib.from_url(app.config["REDIS_URL"], decode_responses=True)


def get_redis():
    return _redis
