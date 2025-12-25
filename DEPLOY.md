# Deploy & Operations Guide

This project:
- `back/` — Flask + Flask-SocketIO backend (REST + Socket.IO), encrypted messages, file/image uploads to `instance/uploads`.
- `front/` — Expo (React Native) client (dialogs + groups, unread badges, notifications, attachments).

Default dev base URL: **http://localhost:5000**.

## 1) Local development
### Backend
```powershell
cd back
python -m venv .venv
.\.venv\Scripts\activate      # bash: source .venv/bin/activate
pip install -r requirements.txt
```
Env (`back/.env`):
```
DATABASE_URL=sqlite:///chat.db          # or postgresql://user:pass@host:5432/db
JWT_SECRET_KEY=change-me
SECRET_KEY=another-secret               # used to derive Fernet if MESSAGE_ENC_KEY absent
MESSAGE_ENC_KEY=<fernet-base64-key>     # optional; recommended
FLASK_ENV=development
CORS_ORIGINS=*
PORT=5000
```
Run migrations:
```powershell
set FLASK_APP=run.py
flask db upgrade
```
Start (Socket.IO ready):
```powershell
python run.py   # http://0.0.0.0:5000
```
Uploads are stored in `back/instance/uploads` (auto-created, keep writable).

### Frontend
```powershell
cd front
npm install
EXPO_PUBLIC_API_BASE_URL=http://localhost:5000 `
EXPO_PUBLIC_WS_URL=http://localhost:5000 `
npx expo start --web        # or --android / --ios with Expo Go
```
Smoke test: register users, send dialog + group messages, attach file/image, check unread badges and sender info.

## 2) Production (Ubuntu example)
### Backend
```bash
sudo apt update && sudo apt install -y python3.11 python3.11-venv postgresql nginx
sudo useradd -m chatapp || true
sudo -u chatapp git clone <repo> /home/chatapp/app
cd /home/chatapp/app/back
python3.11 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```
`/home/chatapp/app/back/.env`:
```
DATABASE_URL=postgresql://chat_user:chat_pass@127.0.0.1:5432/chat
JWT_SECRET_KEY=<strong-random>
SECRET_KEY=<strong-random>
MESSAGE_ENC_KEY=<Fernet key>
FLASK_ENV=production
CORS_ORIGINS=https://your-domain
PORT=5000
```
DB:
```bash
sudo -u postgres createuser chat_user -P
sudo -u postgres createdb -O chat_user chat
FLASK_APP=run.py flask db upgrade
```
systemd (`/etc/systemd/system/chat-backend.service`):
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
Enable:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chat-backend
```
Nginx (`/etc/nginx/sites-available/chat.conf`):
```
server {
  listen 80;
  server_name 77.110.109.201;

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
Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/chat.conf /etc/nginx/sites-enabled/chat.conf
sudo nginx -t && sudo systemctl reload nginx
```

### Frontend deployment
- Mobile (Expo): set `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_WS_URL` to your domain. For push/notifications build a dev/prod client with EAS (Expo Go has limits).
- Web (optional static):
```bash
cd /home/chatapp/app/front
npm install
EXPO_PUBLIC_API_BASE_URL=http://77.110.109.201 \
EXPO_PUBLIC_WS_URL=http://77.110.109.201 \
npx expo export --platform web --output-dir dist
```
Serve `dist` in Nginx:
```
location / {
  root /home/chatapp/app/front/dist;
  try_files $uri /index.html;
}
```
- Android APK/AAB (cloud, easiest):  
```bash
npm install -g eas-cli
cd /home/chatapp/app/front
eas login
eas build:configure
EXPO_PUBLIC_API_BASE_URL=http://77.110.109.201 EXPO_PUBLIC_WS_URL=http://77.110.109.201 \
eas build -p android --profile preview
```
(For local Gradle builds нужен установленный Android SDK.)

## 3) Environment variable checklist
Backend: `DATABASE_URL`, `JWT_SECRET_KEY`, `SECRET_KEY`, `MESSAGE_ENC_KEY`, `FLASK_ENV`, `CORS_ORIGINS`, `PORT`.  
Frontend: `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_WS_URL`.

## 4) Why .env is needed
- Keeps secrets (DB URL, JWT keys, encryption key) out of code.
- Allows different configs per env (dev vs prod).
- Loaded by Flask at startup and by shell when exporting vars for frontend builds.

## 5) Notes & troubleshooting
- Socket.IO must be proxied with Upgrade headers; plain WS URL won’t work.
- Attachments: ensure `instance/uploads` writable; Nginx should pass `/uploads/*` to backend or serve from that path.
- Encryption: set `MESSAGE_ENC_KEY` (Fernet); if missing, derived from `SECRET_KEY`.
- Expo notifications: for full support use a dev/prod build (not Expo Go). Provide your own sound by loading a local asset in `maybeNotify` (see `front/App.js`).
- Unread highlighting and sender info rely on backend returning `sender_username`/`avatar_url` and unread counts; keep backend/current migrations applied.
