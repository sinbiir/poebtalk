from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    decode_token,
)

from app.extensions import db
from app.models import User
from app.utils.security import hash_password, verify_password

bp = Blueprint("auth", __name__)


def error_response(code: str, message: str, status: int):
    return jsonify({"error": {"code": code, "message": message}}), status


def user_payload(user: User):
    return {"id": user.id, "username": user.username}


@bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password")
    if not username or not password:
        return error_response("bad_request", "username and password are required", 400)

    if User.query.filter_by(username=username).first():
        return error_response("username_taken", "Username already exists", 400)

    user = User(username=username)
    user.password_hash = hash_password(password)
    db.session.add(user)
    db.session.commit()

    access_token = create_access_token(identity=user.id, additional_claims={"type": "access"})
    refresh_token = create_refresh_token(identity=user.id, additional_claims={"type": "refresh"})
    return (
        jsonify({"user": user_payload(user), "access_token": access_token, "refresh_token": refresh_token}),
        201,
    )


@bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password")
    if not username or not password:
        return error_response("bad_request", "username and password are required", 400)

    user = User.query.filter_by(username=username).first()
    if not user or not verify_password(password, user.password_hash):
        return error_response("invalid_credentials", "Invalid username or password", 401)

    access_token = create_access_token(identity=user.id, additional_claims={"type": "access"})
    refresh_token = create_refresh_token(identity=user.id, additional_claims={"type": "refresh"})
    return jsonify({"user": user_payload(user), "access_token": access_token, "refresh_token": refresh_token})


@bp.route("/refresh", methods=["POST"])
def refresh():
    data = request.get_json(force=True, silent=True) or {}
    token = data.get("refresh_token")
    if not token:
        return error_response("token_missing", "refresh_token is required", 400)
    try:
        decoded = decode_token(token)
    except Exception:
        return error_response("token_invalid", "Invalid refresh token", 401)

    if decoded.get("type") != "refresh":
        return error_response("token_invalid", "Invalid refresh token type", 401)

    identity = decoded.get("sub")
    user = User.query.get(identity)
    if not user:
        return error_response("user_not_found", "User not found", 404)

    new_access = create_access_token(identity=identity, additional_claims={"type": "access"})
    return jsonify({"access_token": new_access})
