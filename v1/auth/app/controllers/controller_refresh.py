from flask import request

from app.services import service_refresh as svc


def refresh():
    return svc.refresh_access_token(request)