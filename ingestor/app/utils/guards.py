from functools import wraps

from flask import current_app, jsonify, request


def internal_only(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if request.headers.get("X-Internal-Token") != current_app.config["INTERNAL_TOKEN"]:
            return jsonify(error="forbidden"), 403
        return fn(*args, **kwargs)

    return wrapper