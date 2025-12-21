import os
import uuid
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_jwt_extended import jwt_required

bp = Blueprint("uploads", __name__)


@bp.route("", methods=["POST"])
@jwt_required()
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": {"code": "bad_request", "message": "file is required"}}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": {"code": "bad_request", "message": "empty filename"}}), 400

    upload_dir = Path(current_app.instance_path) / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = upload_dir / filename
    file.save(filepath)

    # relative URL for storage, absolute for clients (needed for images on web)
    rel_url = f"/uploads/{filename}"
    abs_url = request.url_root.rstrip("/") + rel_url
    return jsonify(
        {
            "url": rel_url,
            "absolute_url": abs_url,
            "file_name": file.filename,
            "file_size": filepath.stat().st_size,
            "file_mime": file.mimetype,
        }
    )


@bp.route("/<path:filename>", methods=["GET"])
def serve_file(filename):
    upload_dir = Path(current_app.instance_path) / "uploads"
    return send_from_directory(upload_dir, filename, as_attachment=False)
