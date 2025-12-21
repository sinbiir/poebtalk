import os
import base64
import hashlib
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from werkzeug.security import check_password_hash, generate_password_hash


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return check_password_hash(password_hash, password)


_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    """Always return a Fernet instance; derive key from SECRET_KEY if MESSAGE_ENC_KEY is not set."""
    global _fernet
    if _fernet is not None:
        return _fernet

    key = os.getenv("MESSAGE_ENC_KEY")
    if not key:
        secret = os.getenv("SECRET_KEY", "dev-secret-key")
        derived = hashlib.sha256(secret.encode()).digest()
        key = base64.urlsafe_b64encode(derived).decode()

    _fernet = Fernet(key.encode())
    return _fernet


def encrypt_text(plain: str) -> str:
    if plain is None:
        return None
    f = _get_fernet()
    return f.encrypt(plain.encode()).decode()


def decrypt_text(value: str) -> str:
    if value is None:
        return None
    f = _get_fernet()
    try:
        return f.decrypt(value.encode()).decode()
    except InvalidToken:
        # If stored plaintext from old data, return as-is to avoid data loss
        return value
