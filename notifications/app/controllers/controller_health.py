from flask import current_app, jsonify


def health():
    return jsonify(status="ok", service=current_app.config["SERVICE_NAME"])