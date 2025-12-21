# Flask 1:1 Chat Backend
Пошаговый запуск: просто идите сверху вниз.

## 1) Требования
- Python 3.11+
- PostgreSQL (прод) или SQLite (локально)

## 2) Создать и активировать venv
```bash
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
# bash/zsh
source .venv/bin/activate
```

## 3) Установить зависимости
```bash
pip install -r requirements.txt
```

## 4) Настроить переменные окружения
Создайте `.env` рядом с `run.py` (или экспортируйте вручную):
```
DATABASE_URL=postgresql://user:pass@localhost:5432/chat   # или sqlite:///chat.db
JWT_SECRET_KEY=change-me
FLASK_ENV=development
CORS_ORIGINS=*
```

## 5) Применить миграции
```bash
set FLASK_APP=run.py        # bash/zsh: export FLASK_APP=run.py
flask db init   # однократно, создаст migrations/ (уже есть .gitkeep)
flask db migrate
flask db upgrade
```

## 6) Запустить сервер (HTTP + WebSocket)
```bash
python run.py
# альтернатива
flask run
```
По умолчанию поднимется на `http://localhost:5000`.

## 7) Минимальная проверка API
```bash
curl -X POST http://localhost:5000/auth/register -H "Content-Type: application/json" ^
  -d "{\"username\":\"alice\",\"password\":\"pass\"}"
```
Получите `access_token`, затем:
```bash
curl http://localhost:5000/dialogs -H "Authorization: Bearer <access>"
```

## 8) WebSocket (Socket.IO) quick start
1. Подключитесь к `ws://localhost:5000/socket.io/?transport=websocket`.
2. Первым сообщением отправьте:
```
{ "type": "auth", "access_token": "<access>" }
```
3. Затем `message:send` / `message:delivered` / `message:read`. Сервер отвечает `message:ack`, `message:new`, `message:status`.

## 9) Контракты REST
- POST `/auth/register` — { "username", "password" }
- POST `/auth/login` — { "username", "password" }
- POST `/auth/refresh` — { "refresh_token" }
- GET `/dialogs`
- POST `/dialogs` — { "peer_user_id" }
- GET `/dialogs/{dialog_id}/messages?limit=30&before=ISO`
- POST `/dialogs/{dialog_id}/messages` — { "client_msg_id", "type": "text", "text" }
- POST `/dialogs/{dialog_id}/read_up_to` — { "last_read_message_id", "read_at": "ISO" }

## 10) Формат WebSocket сообщений
- Авторизация: `{ "type": "auth", "access_token": "<access>" }`
- Отправка: `message:send` с `{ dialog_id, client_msg_id, msg_type: "text", text }`
- Доставлено: `message:delivered` с `{ message_id, delivered_at }`
- Прочитано: `message:read` с `{ dialog_id, last_read_message_id, read_at }`
- Ответы: `message:ack`, `message:new`, `message:status` (см. контракт).
