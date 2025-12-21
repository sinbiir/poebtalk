from flask import request, session as socket_session
from flask_jwt_extended import decode_token
from sqlalchemy.exc import IntegrityError
from flask_socketio import disconnect, join_room

from app.extensions import db, socketio
from app.models import Dialog, Message
from app.utils.time import isoformat, parse_iso8601, utcnow
from app.utils.security import encrypt_text, decrypt_text


def _emit_error(message: str):
    socketio.emit("error", {"error": {"code": "ws_error", "message": message}}, to=request.sid)


def _require_auth():
    user_id = socket_session.get("user_id")
    if not user_id:
        _emit_error("Unauthorized")
        disconnect()
        return None
    return user_id


def _serialize_message(message: Message):
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


@socketio.on("connect")
def handle_connect():
    socket_session["user_id"] = None


@socketio.on("disconnect")
def handle_disconnect():
    socket_session.pop("user_id", None)


@socketio.on("message")
def handle_message(data):
    if not isinstance(data, dict) or "type" not in data:
        _emit_error("Invalid payload")
        return
    event_type = data.get("type")
    payload = data.get("payload") or {}

    if event_type == "auth":
        _handle_auth(data)
        return

    user_id = _require_auth()
    if not user_id:
        return

    if event_type == "message:send":
        _handle_message_send(user_id, payload)
    elif event_type == "message:delivered":
        _handle_message_delivered(user_id, payload)
    elif event_type == "message:read":
        _handle_message_read(user_id, payload)
    else:
        _emit_error("Unknown event type")


def _handle_auth(data):
    token = data.get("access_token") or (data.get("payload") or {}).get("access_token")
    if not token:
        _emit_error("access_token is required")
        disconnect()
        return
    try:
        decoded = decode_token(token)
    except Exception:
        _emit_error("Invalid token")
        disconnect()
        return
    if decoded.get("type") != "access":
        _emit_error("Invalid token type")
        disconnect()
        return
    user_id = decoded.get("sub")
    socket_session["user_id"] = user_id
    join_room(f"user:{user_id}")


def _handle_message_send(user_id: str, payload: dict):
    dialog_id = payload.get("dialog_id")
    client_msg_id = payload.get("client_msg_id")
    msg_type = payload.get("msg_type") or payload.get("type") or payload.get("message_type") or "text"
    text = payload.get("text")
    file_url = payload.get("file_url")
    file_name = payload.get("file_name")
    file_mime = payload.get("file_mime")
    file_size = payload.get("file_size")
    if not dialog_id or not client_msg_id:
        _emit_error("dialog_id and client_msg_id are required")
        return
    dialog = Dialog.query.get(dialog_id)
    if not dialog or not dialog.includes_user(user_id):
        _emit_error("Dialog not found or access denied")
        return
    if msg_type == "text":
        if text is None:
            _emit_error("text is required for text messages")
            return
    elif msg_type in {"file", "image"}:
        if not file_url or not file_name:
            _emit_error("file_url and file_name are required for attachments")
            return
    else:
        _emit_error("Unsupported message type")
        return

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
            Message.query.filter_by(sender_id=user_id, client_msg_id=client_msg_id, dialog_id=dialog_id).first()
        )
        if not message:
            _emit_error("Message conflict")
            return
    dialog.last_message_id = message.id
    dialog.last_message_at = message.created_at
    db.session.commit()

    msg_payload = _serialize_message(message)
    socketio.emit(
        "message:ack",
        {"type": "message:ack", "payload": {"client_msg_id": client_msg_id, "message": msg_payload}},
        to=request.sid,
    )
    peer_id = dialog.peer_for(user_id).id
    socketio.emit("message:new", {"type": "message:new", "payload": {"message": msg_payload}}, room=f"user:{peer_id}")


def _handle_message_delivered(user_id: str, payload: dict):
    message_id = payload.get("message_id")
    delivered_at_raw = payload.get("delivered_at")
    if not message_id or not delivered_at_raw:
        _emit_error("message_id and delivered_at are required")
        return
    message = Message.query.get(message_id)
    if not message or not message.dialog.includes_user(user_id):
        _emit_error("Message not found or access denied")
        return
    if message.delivered_at:
        return
    delivered_at_dt = parse_iso8601(delivered_at_raw)
    if not delivered_at_dt:
        _emit_error("Invalid delivered_at format")
        return
    message.delivered_at = delivered_at_dt
    db.session.commit()

    socketio.emit(
        "message:status",
        {
            "type": "message:status",
            "payload": {
                "dialog_id": message.dialog_id,
                "message_id": message.id,
                "delivered_at": isoformat(message.delivered_at),
                "read_at": isoformat(message.read_at),
            },
        },
        room=f"user:{message.sender_id}",
    )


def _handle_message_read(user_id: str, payload: dict):
    dialog_id = payload.get("dialog_id")
    last_read_message_id = payload.get("last_read_message_id")
    read_at_raw = payload.get("read_at")
    if not dialog_id or not last_read_message_id or not read_at_raw:
        _emit_error("dialog_id, last_read_message_id and read_at are required")
        return
    dialog = Dialog.query.get(dialog_id)
    if not dialog or not dialog.includes_user(user_id):
        _emit_error("Dialog not found or access denied")
        return
    target_message = Message.query.filter_by(id=last_read_message_id, dialog_id=dialog_id).first()
    if not target_message:
        _emit_error("Message not found")
        return
    read_at_dt = parse_iso8601(read_at_raw)
    if not read_at_dt:
        _emit_error("Invalid read_at")
        return
    Message.query.filter(
        Message.dialog_id == dialog_id,
        Message.sender_id != user_id,
        Message.created_at <= target_message.created_at,
        Message.read_at.is_(None),
    ).update({"read_at": read_at_dt}, synchronize_session=False)
    db.session.commit()
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
        room=f"user:{target_message.sender_id}",
    )
