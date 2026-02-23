import { AppState, AppStateStatus, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../api/client';
import { Message, UnreadCount } from '../types/messaging';

// ── Derive WS URL from API URL ────────────────────────────────────────────
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');

// ── Minimal event emitter ─────────────────────────────────────────────────
type EventMap = {
  new_message: Message;
  unread_update: UnreadCount;
  connected: null;
  disconnected: null;
};

type Handler<T> = (data: T) => void;

class SimpleEmitter {
  private listeners: { [K in keyof EventMap]?: Set<Handler<EventMap[K]>> } = {};

  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>) {
    if (!this.listeners[event]) {
      (this.listeners[event] as Set<Handler<EventMap[K]>>) = new Set();
    }
    (this.listeners[event] as Set<Handler<EventMap[K]>>).add(handler);
  }

  off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>) {
    (this.listeners[event] as Set<Handler<EventMap[K]>> | undefined)?.delete(handler);
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]) {
    (this.listeners[event] as Set<Handler<EventMap[K]>> | undefined)?.forEach(h => h(data));
  }
}

// ── WebSocket manager ─────────────────────────────────────────────────────
class WebSocketManager extends SimpleEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backgroundTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private readonly maxBackoffMs = 30_000;
  private closing = false;   // true when we intentionally close (no reconnect)

  /** Call once on app start (after login). */
  async connect() {
    const token = await this._getToken();
    if (!token) return;

    this._clearReconnectTimer();
    this.closing = false;

    const url = `${WS_BASE_URL}/ws/messaging/?token=${token}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this._startHeartbeat();
      this.emit('connected', null);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'new_message') {
          this.emit('new_message', data.message as Message);
        } else if (data.type === 'unread_update') {
          this.emit('unread_update', data.counts as UnreadCount);
        }
      } catch {
        // malformed frame — ignore
      }
    };

    this.ws.onclose = () => {
      this._stopHeartbeat();
      this.ws = null;
      this.emit('disconnected', null);
      if (!this.closing) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose fires right after onerror, so reconnect is handled there
      this.ws?.close();
    };
  }

  /** Call on logout. */
  disconnect() {
    this.closing = true;
    this._clearReconnectTimer();
    this._clearBackgroundTimer();
    this._stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  /**
   * Wire this into a top-level AppState listener.
   * e.g. AppState.addEventListener('change', wsManager.handleAppState)
   */
  handleAppState = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      // Coming back to foreground — reconnect immediately if not connected.
      this._clearBackgroundTimer();
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.connect();
      }
    } else if (nextState === 'background') {
      // Disconnect after 30s grace period so brief app-switches don't trigger reconnect churn.
      this.backgroundTimer = setTimeout(() => {
        this.closing = true;
        this.ws?.close();
        this.ws = null;
      }, 30_000);
    }
  };

  // ── Private ──────────────────────────────────────────────────────────────

  private _scheduleReconnect() {
    const delay = Math.min(1_000 * Math.pow(2, this.reconnectAttempts), this.maxBackoffMs);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private _clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _clearBackgroundTimer() {
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }

  // Send a no-op ping every 25 s so NGINX and home-router NAT tables
  // don't close the idle TCP connection (NGINX default timeout is 60 s).
  // The server consumer ignores the message via its `pass` receive handler.
  private _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25_000);
  }

  private _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async _getToken(): Promise<string | null> {
    if (Platform.OS === 'web') return localStorage.getItem('auth_token');
    return SecureStore.getItemAsync('auth_token');
  }
}

export const wsManager = new WebSocketManager();
