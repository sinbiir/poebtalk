from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
# Let Flask-SocketIO pick the best available async mode (eventlet/gevent/threading).
socketio = SocketIO(async_mode=None, json=None)
cors = CORS()
