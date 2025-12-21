from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.exc import IntegrityError

from app.extensions import db, socketio
from app.models import Group, GroupMember, GroupMessage, User
from app.utils.security import decrypt_text, encrypt_text
from app.utils.time import isoformat, parse_iso8601, utcnow

bp = Blueprint("groups", __name__)


def error_response(code: str, message: str, status: int):
    return jsonify({"error": {"code": code, "message": message}}), status


def serialize_message(msg: GroupMessage):
    sender = msg.sender
    return {
        "id": msg.id,
        "group_id": msg.group_id,
        "client_msg_id": msg.client_msg_id,
        "sender_id": msg.sender_id,
        "sender_username": sender.username if sender else None,
        "sender_avatar_url": sender.avatar_url if sender else None,
        "type": msg.type,
        "text": decrypt_text(msg.text),
        "file_url": msg.file_url,
        "file_name": msg.file_name,
        "file_mime": msg.file_mime,
        "file_size": msg.file_size,
        "created_at": isoformat(msg.created_at),
        "delivered_at": isoformat(msg.delivered_at),
        "read_at": isoformat(msg.read_at),
    }


def serialize_group(group: Group, current_user_id: str):
    members = [
        {"id": gm.user.id, "username": gm.user.username, "avatar_url": gm.user.avatar_url}
        for gm in group.members
    ]
    return {
        "id": group.id,
        "name": group.name,
        "owner_id": group.owner_id,
        "created_at": isoformat(group.created_at),
        "members": members,
        "last_message_at": isoformat(group.messages[-1].created_at) if group.messages else None,
        "last_message": serialize_message(group.messages[-1]) if group.messages else None,
    }


def _ensure_member(group_id: str, user_id: str):
    member = GroupMember.query.filter_by(group_id=group_id, user_id=user_id).first()
    return member is not None


@bp.route("", methods=["GET"])
@jwt_required()
def list_groups():
    user_id = get_jwt_identity()
    groups = (
        Group.query.join(GroupMember, GroupMember.group_id == Group.id)
        .filter(GroupMember.user_id == user_id)
        .all()
    )
    return jsonify({"items": [serialize_group(g, user_id) for g in groups]})


@bp.route("", methods=["POST"])
@jwt_required()
def create_group():
    user_id = get_jwt_identity()
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    member_ids = data.get("member_ids") or []
    member_usernames = data.get("member_usernames") or []
    if not name:
        return error_response("bad_request", "name is required", 400)
    if user_id not in member_ids:
        member_ids.append(user_id)
    users = set(User.query.filter(User.id.in_(member_ids)).all())
    if member_usernames:
        users.update(User.query.filter(User.username.in_(member_usernames)).all())
    found_ids = {u.id for u in users}
    missing = set(member_ids) - found_ids
    if missing:
        return error_response("user_not_found", f"User(s) not found: {', '.join(missing)}", 404)

    group = Group(name=name, owner_id=user_id, created_at=utcnow())
    db.session.add(group)
    db.session.flush()
    for uid in found_ids:
        db.session.add(GroupMember(group_id=group.id, user_id=uid, added_at=utcnow()))
    db.session.commit()
    return jsonify({"group": serialize_group(group, user_id)}), 201


@bp.route("/<group_id>/members", methods=["POST"])
@jwt_required()
def add_members(group_id):
    user_id = get_jwt_identity()
    group = Group.query.get(group_id)
    if not group:
        return error_response("not_found", "Group not found", 404)
    if group.owner_id != user_id:
        return error_response("forbidden", "Only owner can add members", 403)
    data = request.get_json(force=True, silent=True) or {}
    member_ids = data.get("member_ids") or []
    member_usernames = data.get("member_usernames") or []
    if not member_ids and not member_usernames:
        return error_response("bad_request", "member_ids or member_usernames required", 400)
    users = set(User.query.filter(User.id.in_(member_ids)).all())
    if member_usernames:
        users.update(User.query.filter(User.username.in_(member_usernames)).all())
    found_ids = {u.id for u in users}
    for uid in found_ids:
        gm = GroupMember(group_id=group.id, user_id=uid, added_at=utcnow())
        try:
            db.session.add(gm)
            db.session.flush()
        except IntegrityError:
            db.session.rollback()
            continue
    db.session.commit()
    return jsonify({"group": serialize_group(group, user_id)})


@bp.route("/<group_id>/messages", methods=["GET"])
@jwt_required()
def list_group_messages(group_id):
    user_id = get_jwt_identity()
    if not _ensure_member(group_id, user_id):
        return error_response("forbidden", "Not in group", 403)
    before_param = request.args.get("before")
    limit = int(request.args.get("limit", 30))
    query = GroupMessage.query.filter_by(group_id=group_id)
    if before_param:
        before_dt = parse_iso8601(before_param)
        if not before_dt:
            return error_response("bad_request", "Invalid before parameter", 400)
        query = query.filter(GroupMessage.created_at < before_dt)
    messages = query.order_by(GroupMessage.created_at.desc()).limit(limit).all()
    next_cursor = isoformat(messages[-1].created_at) if messages and len(messages) == limit else None
    return jsonify({"items": [serialize_message(m) for m in messages], "next_cursor": next_cursor})


@bp.route("/<group_id>/messages", methods=["POST"])
@jwt_required()
def send_group_message(group_id):
    user_id = get_jwt_identity()
    if not _ensure_member(group_id, user_id):
        return error_response("forbidden", "Not in group", 403)
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

    msg = GroupMessage(
        group_id=group_id,
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
    db.session.add(msg)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        msg = GroupMessage.query.filter_by(sender_id=user_id, client_msg_id=client_msg_id, group_id=group_id).first()
        if not msg:
            return error_response("conflict", "Message conflict", 409)

    payload = serialize_message(msg)
    # notify members
    member_ids = [gm.user_id for gm in GroupMember.query.filter_by(group_id=group_id).all()]
    for uid in member_ids:
        socketio.emit("group:message:new", {"type": "group:message:new", "payload": {"message": payload}}, room=f"user:{uid}")
    # ack to sender
    socketio.emit(
        "group:message:ack",
        {"type": "group:message:ack", "payload": {"client_msg_id": client_msg_id, "message": payload}},
        room=f"user:{user_id}",
    )
    return jsonify({"message": payload})
