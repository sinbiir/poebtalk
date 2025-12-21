export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:5000';
// Socket.IO client prefers http/https base; actual transport is forced to WebSocket in wsClient.
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'http://localhost:5000';
export const PAGE_SIZE = 30;
