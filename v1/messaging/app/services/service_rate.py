"""Send-rate limiting for messaging."""
import time

from app.extensions import get_redis

SEND_WINDOW_SECONDS = 60
SEND_MAX_PER_WINDOW = 30


def allow_send(user_id) -> bool:
    redis = get_redis()
    if not redis:
        return True
    key = f"messaging:rate:{user_id}"
    now = time.time()
    cutoff = now - SEND_WINDOW_SECONDS
    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, cutoff)
    pipe.zcard(key)
    _, count = pipe.execute()
    if int(count) >= SEND_MAX_PER_WINDOW:
        return False
    redis.zadd(key, {f"{now}": now})
    redis.expire(key, SEND_WINDOW_SECONDS + 5)
    return True