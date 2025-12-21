# Deploy & Local Linking Guide

This project has two parts:
- `back/` – Flask + Flask-SocketIO backend (REST + Socket.IO over WebSocket).
- `front/` – Expo (React Native) client that talks to the backend via HTTP and Socket.IO.

The defaults now assume the backend runs on **http://localhost:5000** and exposes Socket.IO on the same origin.

## 1. Local development (backend + frontend together)
### Backend
1) Prerequisites: Python 3.11+, PostgreSQL (or use the built-in SQLite URL for quick tests).
2) From repo root:
   ```powershell
   cd back
   python -m venv .venv
   .\.venv\Scripts\activate          # PowerShell; on Unix: source .venv/bin/activate
   pip install -r requirements.txt
   ```
3) Environment (.env in `back/`):
   ```
   DATABASE_URL=sqlite:///chat.db          # or postgresql://user:pass@host:5432/db
   JWT_SECRET_KEY=change-me
   FLASK_ENV=development
   CORS_ORIGINS=*
   PORT=5000
   ```
4) Migrations:
   ```powershell
   set FLASK_APP=run.py         # Unix: export FLASK_APP=run.py
   flask db upgrade
   ```
5) Run (uses eventlet for WebSocket):
   ```powershell
   python run.py                # serves on http://0.0.0.0:5000
   ```

### Frontend
1) Prerequisites: Node 18+, npm, Expo CLI (bundled with `npx expo`).
2) Install deps (already run once, but repeat after pulling changes):
   ```powershell
   cd front
   npm install
   ```
3) Link to backend (defaults are now correct, but you can override):
   ```powershell
   EXPO_PUBLIC_API_BASE_URL=http://localhost:5000 `
   EXPO_PUBLIC_WS_URL=http://localhost:5000 `
   npx expo start --web
   ```
   - For device: `npx expo start --android` or `--ios`; scan QR in Expo Go with the same env vars.
4) Quick smoke test:
   - Register two users, create a dialog, send messages.
   - Verify message status changes (sending → ack → delivered/read) and that new messages arrive in real time.

## 2. Production deployment (Ubuntu example)
### Backend service
1) System packages:
   ```bash
   sudo apt update
   sudo apt install -y python3.11 python3.11-venv postgresql nginx
   ```
2) App user & checkout (replace paths as needed):
   ```bash
   sudo useradd -m chatapp || true
   sudo -u chatapp git clone <repo> /home/chatapp/app
   cd /home/chatapp/app/back
   python3.11 -m venv .venv
   . .venv/bin/activate
   pip install -r requirements.txt
   ```
3) Environment file `/home/chatapp/app/back/.env`:
   ```
   DATABASE_URL=postgresql://chat_user:chat_pass@127.0.0.1:5432/chat
   JWT_SECRET_KEY=<strong-random>
   FLASK_ENV=production
   CORS_ORIGINS=https://your-domain
   PORT=5000
   ```
4) Database (PostgreSQL):
   ```bash
   sudo -u postgres createuser chat_user -P
   sudo -u postgres createdb -O chat_user chat
   FLASK_APP=run.py flask db upgrade
   ```
5) Gunicorn + eventlet (Socket.IO-friendly) systemd unit `/etc/systemd/system/chat-backend.service`:
   ```
   [Unit]
   Description=Chat Backend
   After=network.target

   [Service]
   User=chatapp
   WorkingDirectory=/home/chatapp/app/back
   Environment="FLASK_APP=run.py"
   EnvironmentFile=/home/chatapp/app/back/.env
   ExecStart=/home/chatapp/app/back/.venv/bin/gunicorn --worker-class eventlet -w 1 -b 0.0.0.0:5000 run:app
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target
   ```
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now chat-backend
   ```

6) Nginx reverse proxy (`/etc/nginx/sites-available/chat.conf`):
   ```
   server {
     server_name your-domain;

     location /socket.io/ {
       proxy_pass http://127.0.0.1:5000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "Upgrade";
       proxy_set_header Host $host;
     }

     location / {
       proxy_pass http://127.0.0.1:5000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $remote_addr;
     }
   }
   ```
   ```bash
   sudo ln -s /etc/nginx/sites-available/chat.conf /etc/nginx/sites-enabled/chat.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```

### Frontend options
- **Mobile (Expo Go / builds):** Set `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_WS_URL` to your public backend URL (e.g., `https://your-domain`). Publish or build with EAS/Expo.
- **Web build (optional):**
  ```bash
  cd /home/chatapp/app/front
  npm install
  EXPO_PUBLIC_API_BASE_URL=https://your-domain \
  EXPO_PUBLIC_WS_URL=https://your-domain \
  npx expo export --platform web --output-dir dist
  ```
  Serve `dist` with Nginx:
  ```
  location / {
    root /home/chatapp/app/front/dist;
    try_files $uri /index.html;
  }
  ```

## 3. Environment variable checklist
- Backend: `DATABASE_URL`, `JWT_SECRET_KEY`, `FLASK_ENV`, `CORS_ORIGINS`, `PORT`.
- Frontend: `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_WS_URL`.

## 4. Notes & troubleshooting
- Socket.IO is required for realtime; plain WebSocket URLs will not work. Keep `/socket.io/` reachable and allow upgrade headers through the proxy.
- For dev SQLite is fine; for production use PostgreSQL to avoid file-locking issues.
- If tokens expire too quickly, adjust JWT settings in `back/app/config.py` (add `JWT_ACCESS_TOKEN_EXPIRES`, etc.).
- When changing dependencies in `front/`, run `npm install` to refresh `package-lock.json`.
