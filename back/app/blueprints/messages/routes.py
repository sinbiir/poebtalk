from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.exc import IntegrityError

from app.extensions import db, socketio
from app.models import Dialog, Message
from app.utils.time import isoformat, parse_iso8601, utcnow
from app.utils.security import encrypt_text, decrypt_text

bp = Blueprint("messages", __name__)


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


def _get_dialog_or_forbid(dialog_id: str, user_id: str):
    dialog = Dialog.query.get(dialog_id)
    if not dialog:
        return None, error_response("not_found", "Dialog not found", 404)
    if not dialog.includes_user(user_id):
        return None, error_response("forbidden", "Access denied", 403)
    return dialog, None


@bp.route("/<dialog_id>/messages", methods=["GET"])
@jwt_required()
def get_messages(dialog_id):
    user_id = get_jwt_identity()
    dialog, err = _get_dialog_or_forbid(dialog_id, user_id)
    if err:
        return err

    before_param = request.args.get("before")
    limit = int(request.args.get("limit", 30))
    query = Message.query.filter_by(dialog_id=dialog_id)
    if before_param:
        before_dt = parse_iso8601(before_param)
        if not before_dt:
            return error_response("bad_request", "Invalid before parameter", 400)
        query = query.filter(Message.created_at < before_dt)

    messages = query.order_by(Message.created_at.desc()).limit(limit).all()
    next_cursor = isoformat(messages[-1].created_at) if messages and len(messages) == limit else None

    return jsonify({"items": [serialize_message(m) for m in messages], "next_cursor": next_cursor})


@bp.route("/<dialog_id>/messages", methods=["POST"])
@jwt_required()
def send_message(dialog_id):
    user_id = get_jwt_identity()
    dialog, err = _get_dialog_or_forbid(dialog_id, user_id)
    if err:
        return err

    data = request.get_json(force=True, silent=True) or {}
    client_msg_id = data.get("client_msg_id")
    msg_type = data.get("type")
    text = data.get("text")
    file_url = data.get("file_url")
    file_name = data.get("file_name")
    file_mime = data.get("file_mime")
    file_size = data.get("file_size")

    if not client_msg_id or not msg_type:
        return error_response("bad_request", "client_msg_id and type are required", 400)

    if msg_type == "text":
        if text is None:
            return error_response("bad_request", "text is required for text messages", 400)
    elif msg_type in {"file", "image"}:
        if not file_url or not file_name:
            return error_response("bad_request", "file_url and file_name are required for attachments", 400)
    else:
        return error_response("bad_request", "Unsupported message type", 400)

    message = Message(
        dialog_id=dialog_id,
        sender_id=user_id,
        client_msg_id=client_msg_id,
        type=msg_type,
        text=encrypt_text(text) if text else None,
        file_url=file_url,
        file_name=file_name,
        file_mime=file_mime,
        file_size=file_size,
        created_at=utcnow(),
    )
    db.session.add(message)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        message = (
            Message.query.filter_by(sender_id=user_id, client_msg_id=client_msg_id)
            .filter_by(dialog_id=dialog_id)
            .first()
        )
        if not message:
            return error_response("conflict", "Message already exists with different dialog", 409)

    dialog.last_message_id = message.id
    dialog.last_message_at = message.created_at
    db.session.commit()

    payload = serialize_message(message)
    socketio.emit("message:new", {"type": "message:new", "payload": {"message": payload}}, room=f"user:{dialog.peer_for(user_id).id}")
    return jsonify({"message": payload})


@bp.route("/<dialog_id>/read_up_to", methods=["POST"])
@jwt_required()
def read_up_to(dialog_id):
    user_id = get_jwt_identity()
    dialog, err = _get_dialog_or_forbid(dialog_id, user_id)
    if err:
        return err

    data = request.get_json(force=True, silent=True) or {}
    last_read_message_id = data.get("last_read_message_id")
    read_at_raw = data.get("read_at")
    if not last_read_message_id or not read_at_raw:
        return error_response("bad_request", "last_read_message_id and read_at are required", 400)
    target_message = Message.query.filter_by(id=last_read_message_id, dialog_id=dialog_id).first()
    if not target_message:
        return error_response("not_found", "Message not found", 404)
    read_at_dt = parse_iso8601(read_at_raw)
    if not read_at_dt:
        return error_response("bad_request", "Invalid read_at", 400)

    updated = (
        Message.query.filter(
            Message.dialog_id == dialog_id,
            Message.sender_id != user_id,
            Message.created_at <= target_message.created_at,
        )
        .filter(Message.read_at.is_(None))
        .update({"read_at": read_at_dt}, synchronize_session=False)
    )
    db.session.commit()

    sender_id = target_message.sender_id
    socketio.emit(
        "message:status",
        {
            "type": "message:status",
            "payload": {
                "dialog_id": dialog_id,
                "message_id": last_read_message_id,
                "delivered_at": isoformat(target_message.delivered_at),
                "read_at": isoformat(read_at_dt),
            },
        },
        room=f"user:{sender_id}",
    )
    return jsonify({"ok": True})
