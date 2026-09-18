"""One JSON error shape for every service.

Every error response is `{"error": <message a person can read>}`, plus
`"error_code": <slug>` where a client needs to branch on it (and any extra
detail fields). Web (`lib/http.ts`) and mobile (`ApiClient`) show `error`.

Without these handlers Flask answers unknown routes / wrong methods / crashes
with HTML pages, and flask-jwt-extended answers `{"msg": ...}` with a 422 for
a malformed token — which clients don't recognise as "sign in again". Every
auth failure is a 401 here so both clients refresh (or sign out) the same way.

Shared file: canonical copy in api/auth; scripts/check_shared_files.py keeps the
copies identical.
"""
from flask import jsonify
from werkzeug.exceptions import HTTPException


def error_response(status: int, message: str, error_code: str, **extra):
    return jsonify({"error": message, "error_code": error_code, **extra}), status


def register_error_handlers(app, jwt=None):
    @app.errorhandler(HTTPException)
    def _http_error(exc: HTTPException):
        # abort(403, "why") keeps its message; the stock descriptions are long
        # prose, so those fall back to the short name ("Not Found").
        custom = exc.description and exc.description != type(exc).description
        message = exc.description if custom else (exc.name or "Error")
        code = (exc.name or "error").lower().replace(" ", "_")
        response = exc.get_response()
        body, status = error_response(exc.code or 500, message, code)
        # Keep headers werkzeug sets for the status (e.g. Allow on a 405).
        for key in ("Allow", "Retry-After", "WWW-Authenticate"):
            if key in response.headers:
                body.headers[key] = response.headers[key]
        return body, status

    if jwt is None:
        return

    def _unauthorized(message, code):
        return error_response(401, message, code)

    @jwt.unauthorized_loader
    def _missing(_reason):
        return _unauthorized("Please sign in.", "unauthorized")

    @jwt.invalid_token_loader
    def _invalid(_reason):
        return _unauthorized("Your session is invalid. Please sign in again.", "invalid_token")

    @jwt.expired_token_loader
    def _expired(_header, _payload):
        return _unauthorized("Your session has expired. Please sign in again.", "token_expired")

    @jwt.revoked_token_loader
    def _revoked(_header, _payload):
        return _unauthorized("Your session has ended. Please sign in again.", "token_revoked")

    @jwt.needs_fresh_token_loader
    def _needs_fresh(_header, _payload):
        return _unauthorized("Please sign in again to continue.", "fresh_token_required")

    @jwt.token_verification_failed_loader
    def _verification_failed(_header, _payload):
        return _unauthorized("Your session is invalid. Please sign in again.", "invalid_token")

    @jwt.user_lookup_error_loader
    def _user_lookup(_header, _payload):
        return _unauthorized("Your account could not be found. Please sign in again.", "user_not_found")
