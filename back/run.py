from app import create_app
from app.extensions import socketio

app = create_app()


if __name__ == "__main__":
    # Use socketio.run to support WebSocket transport
    socketio.run(app, host="0.0.0.0", port=int(app.config.get("PORT", 5000)))
