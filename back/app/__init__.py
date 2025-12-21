import logging
import os
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from .config import Config
from .extensions import cors, db, jwt, migrate, socketio


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config())
    _configure_logging(app)

    db.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app, resources={r"/*": {"origins": app.config.get("CORS_ORIGINS", "*")}})
    jwt.init_app(app)
    socketio.init_app(app, cors_allowed_origins=app.config.get("CORS_ORIGINS", "*"))
    _configure_jwt()
    from .ws import handlers  # noqa: F401 - register socket handlers

    from .blueprints.auth.routes import bp as auth_bp
    from .blueprints.dialogs.routes import bp as dialogs_bp
    from .blueprints.messages.routes import bp as messages_bp

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(dialogs_bp, url_prefix="/dialogs")
    app.register_blueprint(messages_bp, url_prefix="/dialogs")

    @app.errorhandler(HTTPException)
    def handle_http_exception(err):
        response = {
            "error": {"code": err.name.lower().replace(" ", "_"), "message": err.description}
        }
        return jsonify(response), err.code

    @app.errorhandler(Exception)
    def handle_exception(err):
        app.logger.exception("Unhandled exception: %s", err)
        response = {"error": {"code": "internal_error", "message": "Internal server error"}}
        return jsonify(response), 500

    return app


def _configure_logging(app: Flask):
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(level=log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    app.logger.setLevel(log_level)


def _configure_jwt():
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": {"code": "token_expired", "message": "Token has expired"}}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error_string):
        return jsonify({"error": {"code": "token_invalid", "message": error_string}}), 401

    @jwt.unauthorized_loader
    def missing_token_callback(error_string):
        return jsonify({"error": {"code": "token_missing", "message": error_string}}), 401
