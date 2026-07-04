from flask import jsonify

from app.utils.config import Config


def health():
    return jsonify(
        {
            "service": Config.SERVICE_NAME,
            "status": "ok",
            "media_mock": Config.MEDIA_MOCK,
        }
    )