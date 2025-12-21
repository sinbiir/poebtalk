# Expo 1:1 Chat (JS)

Simple Expo (React Native) frontend for private 1:1 chat with REST + WebSocket.

## Requirements
- Node 18+
- npm

## Setup
1. Install deps:
   ```sh
   npm install
   ```
2. Configure environment (Expo uses `EXPO_PUBLIC_` vars):
   - `EXPO_PUBLIC_API_BASE_URL` (e.g. `http://localhost:3000`)
   - `EXPO_PUBLIC_WS_URL` (e.g. `ws://localhost:3000/ws`)
   You can set them inline when starting Expo: `EXPO_PUBLIC_API_BASE_URL=... EXPO_PUBLIC_WS_URL=... npx expo start`.

## Run
```sh
npx expo start
```
Use the QR code or run `npx expo start --android` / `--ios` / `--web`.

## Features
- Auth (login/register) with tokens stored in SecureStore
- Dialog list with pull-to-refresh and unread badges
- Chat screen with pagination, pending/sent/read indicators
- REST sync via Axios with refresh-token interceptor
- WebSocket realtime with auto-reconnect and status banner
- Local cache of dialogs/messages via AsyncStorage

## Project Structure
- `App.js` — navigation and WS wiring
- `src/config.js` — base URLs
- `src/api/http.js` — Axios instance/interceptors
- `src/api/endpoints.js` — REST calls
- `src/ws/wsClient.js` — WebSocket manager
- `src/store/authStore.js` — auth state (Zustand + SecureStore)
- `src/store/chatStore.js` — dialogs/messages state, caching
- `src/screens/*` — Login, Register, DialogList, Chat
- `src/components/*` — DialogRow, MessageBubble
- `src/utils/*` — time formatting, uuid helper

## Notes
- Messages send over WS (`message:send`); outgoing messages appear immediately as `Sending` until acked.
- When an active chat receives a new message, the client sends `message:delivered` and `message:read` via WS.
- 401 responses trigger `/auth/refresh`; on failure the user is logged out.