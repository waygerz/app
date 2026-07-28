"""Shared Flask extensions for the leagues service.

The service's Postgres schema is selected via the connection ``search_path``
(see Config.SQLALCHEMY_ENGINE_OPTIONS), so models stay schema-agnostic.
"""
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()
