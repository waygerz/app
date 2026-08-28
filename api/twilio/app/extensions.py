"""Shared extensions for the twilio service.

Unlike the other services this one is stateless — no SQLAlchemy, no JWT, no CORS
(no browser ever calls it). Redis backs only the per-sender rate-limit counter.
"""
import redis as redis_lib

_redis = None


def init_redis(app):
    global _redis
    _redis = redis_lib.from_url(app.config["REDIS_URL"], decode_responses=True)


def get_redis():
    return _redis
