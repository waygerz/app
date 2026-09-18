import hmac
from functools import wraps

from flask import current_app, jsonify, request

# Dev fallbacks from Config. Running prod on these means anyone can mint JWTs or
# call /internal/* — refuse to boot instead.
_DEV_SECRETS = {
    "JWT_SECRET_KEY": "dev-jwt-secret-change-me",
    "INTERNAL_TOKEN": "dev-internal-token",
}


def require_prod_secrets(app):
    if app.config.get("APP_ENV") != "production":
        return
    bad = [k for k, dev in _DEV_SECRETS.items() if app.config.get(k, dev) in ("", dev)]
    if bad:
        raise RuntimeError(f"APP_ENV=production but {', '.join(bad)} unset or dev default")


def internal_only(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = request.headers.get("X-Internal-Token", "")
        if not hmac.compare_digest(token.encode(), current_app.config["INTERNAL_TOKEN"].encode()):
            return jsonify(error="forbidden"), 403
        return fn(*args, **kwargs)

    return wrapper
