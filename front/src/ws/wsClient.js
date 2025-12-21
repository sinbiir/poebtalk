import { io } from 'socket.io-client';
import { WS_URL } from '../config';

class WSClient {
  constructor() {
    this.socket = null;
    this.token = null;
    this.status = 'disconnected';
    this.shouldReconnect = false;
    this.reconnectTimer = null;
    this.listeners = {};
    this.pendingMessages = [];
  }

  setAuthToken(token) {
    this.token = token;
    if (this.socket?.connected) {
      this.sendRaw({ type: 'auth', access_token: token });
    }
  }

  connect(token) {
    if (token) this.token = token;
    if (!this.token) return;

    this.shouldReconnect = true;
    if (this.socket?.connected) {
      return;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    this.openSocket();
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    this.socket = null;
    this.updateStatus('disconnected');
  }

  openSocket() {
    this.updateStatus('connecting');
    this.socket = io(WS_URL, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false, // we handle reconnection ourselves to keep state consistent
    });

    this.socket.on('connect', () => {
      this.updateStatus('connected');
      if (this.token) {
        this.sendRaw({ type: 'auth', access_token: this.token });
      }
      this.flushQueue();
    });

    this.socket.on('disconnect', () => {
      this.updateStatus('disconnected');
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('connect_error', () => {
      this.updateStatus('error');
    });

    const forward = event => payload => {
      this.emit(event, payload?.payload || payload?.message || payload);
    };
    ['message:ack', 'message:new', 'message:status', 'group:message:ack', 'group:message:new', 'error'].forEach(evt => {
      this.socket.on(evt, forward(evt));
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, 3000);
  }

  flushQueue() {
    if (!this.socket || !this.socket.connected) return;
    while (this.pendingMessages.length) {
      const msg = this.pendingMessages.shift();
      this.socket.emit('message', msg);
    }
  }

  send(type, payload) {
    const message = { type, payload };
    if (this.socket?.connected) {
      this.socket.emit('message', message);
    } else {
      this.pendingMessages.push(message);
      if (!this.socket || this.socket.disconnected) {
        this.scheduleReconnect();
      }
    }
  }

  sendRaw(obj) {
    const message = { ...obj };
    if (this.socket?.connected) {
      this.socket.emit('message', message);
    } else {
      this.pendingMessages.push(message);
    }
  }

  on(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type].add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    if (this.listeners[type]) this.listeners[type].delete(handler);
  }

  emit(type, payload) {
    if (this.listeners[type]) {
      this.listeners[type].forEach(fn => fn(payload));
    }
    if (this.listeners['*']) {
      this.listeners['*'].forEach(fn => fn({ type, payload }));
    }
  }

  updateStatus(status) {
    this.status = status;
    this.emit('ws_status', status);
  }
}

const wsClient = new WSClient();
export default wsClient;
