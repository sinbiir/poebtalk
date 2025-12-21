from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db, socketio
from app.models import Dialog, Message, User
from app.utils.time import isoformat, utcnow
from app.utils.security import decrypt_text

bp = Blueprint("dialogs", __name__)


def error_response(code: str, message: str, status: int):
    return jsonify({"error": {"code": code, "message": message}}), status


def serialize_message(message: Message):
    return {
        "id": message.id,
        "dialog_id": message.dialog_id,
        "client_msg_id": message.client_msg_id,
        "sender_id": message.sender_id,
        "type": message.type,
        "text": decrypt_text(message.text),
        "file_url": message.file_url,
        "file_name": message.file_name,
        "file_mime": message.file_mime,
        "file_size": message.file_size,
        "created_at": isoformat(message.created_at),
        "delivered_at": isoformat(message.delivered_at),
        "read_at": isoformat(message.read_at),
    }


def serialize_dialog(dialog: Dialog, current_user_id: str):
    peer = dialog.peer_for(current_user_id)
    unread_count = (
        Message.query.filter(
            Message.dialog_id == dialog.id,
            Message.sender_id == peer.id,
            Message.read_at.is_(None),
        ).count()
    )
    last_msg = dialog.last_message
    last_message_data = None
    if last_msg:
        last_message_data = {
            "id": last_msg.id,
            "type": last_msg.type,
            "text": decrypt_text(last_msg.text),
            "file_url": last_msg.file_url,
            "file_name": last_msg.file_name,
            "file_mime": last_msg.file_mime,
            "file_size": last_msg.file_size,
            "created_at": isoformat(last_msg.created_at),
            "sender_id": last_msg.sender_id,
        }
    return {
        "id": dialog.id,
        "peer": {"id": peer.id, "username": peer.username, "avatar_url": peer.avatar_url},
        "last_message": last_message_data,
        "unread_count": unread_count,
        "last_message_at": isoformat(dialog.last_message_at),
    }


@bp.route("", methods=["GET"])
@jwt_required()
def list_dialogs():
    user_id = get_jwt_identity()
    dialogs = Dialog.query.filter(
        (Dialog.user1_id == user_id) | (Dialog.user2_id == user_id)
    ).order_by(Dialog.last_message_at.desc().nullslast(), Dialog.created_at.desc())

    items = [serialize_dialog(d, user_id) for d in dialogs]
    return jsonify({"items": items, "next_cursor": None})


@bp.route("", methods=["POST"])
@jwt_required()
def create_dialog():
    user_id = get_jwt_identity()
    data = request.get_json(force=True, silent=True) or {}

    peer_user_id = data.get("peer_user_id")
    peer_username = (data.get("peer_username") or "").strip() if data.get("peer_username") else None

    if not peer_user_id and not peer_username:
        return error_response("bad_request", "peer_user_id or peer_username is required", 400)
    if peer_username and peer_user_id:
        return error_response("bad_request", "Provide only one of peer_user_id or peer_username", 400)

    peer = None
    if peer_user_id:
        if peer_user_id == user_id:
            return error_response("bad_request", "Cannot create dialog with yourself", 400)
        peer = User.query.get(peer_user_id)
    else:
        peer = User.query.filter_by(username=peer_username).first()
        if not peer:
            return error_response("user_not_found", "Peer user not found", 404)
        if peer.id == user_id:
            return error_response("bad_request", "Cannot create dialog with yourself", 400)
        peer_user_id = peer.id

    existing = Dialog.get_between_users(user_id, peer_user_id)
    if existing:
        dialog = existing
    else:
        user1_id, user2_id = sorted([user_id, peer_user_id])
        dialog = Dialog(user1_id=user1_id, user2_id=user2_id, created_at=utcnow())
        db.session.add(dialog)
        db.session.commit()

    dialog_data = {
        "id": dialog.id,
        "peer": {"id": peer.id, "username": peer.username, "avatar_url": peer.avatar_url},
    }
    return jsonify({"dialog": dialog_data})
