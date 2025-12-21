import { WS_URL } from '../config';

class WSClient {
  constructor() {
    this.ws = null;
    this.token = null;
    this.status = 'disconnected';
    this.shouldReconnect = false;
    this.reconnectTimer = null;
    this.listeners = {};
    this.pendingMessages = [];
  }

  setAuthToken(token) {
    this.token = token;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw({ type: 'auth', access_token: token });
    }
  }

  connect(token) {
    if (token) this.token = token;
    if (!this.token) return;
    this.shouldReconnect = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.openSocket();
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
    }
    this.ws = null;
    this.updateStatus('disconnected');
  }

  openSocket() {
    this.updateStatus('connecting');
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.updateStatus('connected');
      if (this.token) {
        this.sendRaw({ type: 'auth', access_token: this.token });
      }
      this.flushQueue();
    };

    this.ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type) {
          this.emit(data.type, data.payload || data.message || data);
        }
      } catch (e) {
        console.warn('WS message parse error', e);
      }
    };

    this.ws.onerror = () => {
      this.updateStatus('error');
    };

    this.ws.onclose = () => {
      this.updateStatus('disconnected');
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, 3000);
  }

  flushQueue() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.pendingMessages.length) {
      this.ws.send(this.pendingMessages.shift());
    }
  }

  send(type, payload) {
    const message = JSON.stringify({ type, payload });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.pendingMessages.push(message);
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.scheduleReconnect();
      }
    }
  }

  sendRaw(obj) {
    const msg = JSON.stringify(obj);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this.pendingMessages.push(msg);
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