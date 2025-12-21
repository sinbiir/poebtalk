import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, UniqueConstraint, and_, or_
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


def _utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    avatar_url = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)

    dialogs_as_user1 = db.relationship(
        "Dialog", back_populates="user1", foreign_keys="Dialog.user1_id", cascade="all, delete"
    )
    dialogs_as_user2 = db.relationship(
        "Dialog", back_populates="user2", foreign_keys="Dialog.user2_id", cascade="all, delete"
    )
    messages = db.relationship("Message", back_populates="sender", cascade="all, delete")

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)


class Dialog(db.Model):
    __tablename__ = "dialogs"
    __table_args__ = (
        UniqueConstraint("user1_id", "user2_id", name="uq_dialog_users"),
        CheckConstraint("user1_id != user2_id", name="check_users_different"),
    )

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user1_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    user2_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)
    last_message_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_message_id = db.Column(db.String(36), db.ForeignKey("messages.id"), nullable=True)

    user1 = db.relationship("User", foreign_keys=[user1_id], back_populates="dialogs_as_user1")
    user2 = db.relationship("User", foreign_keys=[user2_id], back_populates="dialogs_as_user2")
    last_message = db.relationship("Message", foreign_keys=[last_message_id], post_update=True)
    messages = db.relationship("Message", back_populates="dialog", cascade="all, delete")

    @staticmethod
    def get_between_users(user_a_id: str, user_b_id: str):
        low, high = sorted([user_a_id, user_b_id])
        return Dialog.query.filter_by(user1_id=low, user2_id=high).first()

    def peer_for(self, user_id: str):
        return self.user1 if self.user2_id == user_id else self.user2

    def includes_user(self, user_id: str) -> bool:
        return self.user1_id == user_id or self.user2_id == user_id


class Message(db.Model):
    __tablename__ = "messages"
    __table_args__ = (UniqueConstraint("sender_id", "client_msg_id", name="uq_sender_client_msg"),)

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dialog_id = db.Column(db.String(36), db.ForeignKey("dialogs.id"), nullable=False, index=True)
    sender_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    client_msg_id = db.Column(db.String(64), nullable=False)
    type = db.Column(db.String(20), nullable=False, default="text")
    text = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False, index=True)
    delivered_at = db.Column(db.DateTime(timezone=True), nullable=True)
    read_at = db.Column(db.DateTime(timezone=True), nullable=True)

    dialog = db.relationship("Dialog", back_populates="messages")
    sender = db.relationship("User", back_populates="messages")
