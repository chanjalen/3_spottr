import { AppState, AppStateStatus } from 'react-native';
import { getToken, API_BASE_URL } from '../api/client';
import { Message, UnreadCount } from '../types/messaging';
import { Announcement } from '../api/organizations';

// ── Derive WS URL from API URL ────────────────────────────────────────────
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');

// ── Queue TTL: drop messages that sat unsent for more than 60 s ───────────
const QUEUE_TTL_MS = 60_000;

// ── Minimal event emitter ─────────────────────────────────────────────────
export type EventMap = {
  new_message: Message;
  new_announcement: Announcement;
  unread_update: UnreadCount;
  reaction_update: { message_id: string; reactions: Array<{ emoji: string; count: number; reactor_ids: string[] }> };
  announcement_reaction_update: { announcement_id: string; org_id: string; reactions: Array<{ emoji: string; count: number; reactor_ids: string[] }> };
  notification_unread_update: { count: number };
  connected: null;
  disconnected: null;
  send_error: { code: string; detail: string; client_msg_id?: string };
  queue_item_flushed: { client_msg_id: string };
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

// ── Types ─────────────────────────────────────────────────────────────────
interface QueuedSend {
  type: 'send_message';
  content: string;
  recipient_id?: string;
  group_id?: string;
  client_msg_id: string;
  enqueuedAt: number;
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
  private sendQueue: QueuedSend[] = [];

  /** Call once on app start (after login). */
  async connect() {
    const token = await getToken();
    if (!token) return;

    this._clearReconnectTimer();
    this.closing = false;

    const url = `${WS_BASE_URL}/ws/messaging/?token=${token}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this._startHeartbeat();
      this._drainQueue(); // drain before emitting 'connected' so screens get flushed events first
      this.emit('connected', null);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'new_message') {
          this.emit('new_message', data.message as Message);
        } else if (data.type === 'new_announcement') {
          this.emit('new_announcement', data.announcement as Announcement);
        } else if (data.type === 'unread_update') {
          this.emit('unread_update', data.counts as UnreadCount);
        } else if (data.type === 'reaction_update') {
          this.emit('reaction_update', data as EventMap['reaction_update']);
        } else if (data.type === 'announcement_reaction_update') {
          this.emit('announcement_reaction_update', data as EventMap['announcement_reaction_update']);
        } else if (data.type === 'notification_unread_update') {
          this.emit('notification_unread_update', { count: data.count as number });
        } else if (data.type === 'error') {
          this.emit('send_error', {
            code: data.code,
            detail: data.detail,
            client_msg_id: data.client_msg_id ?? undefined,
          });
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

  /** Ensure the consumer is subscribed to a group channel. Call when entering GroupChatScreen. */
  subscribeGroup(groupId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe_group', group_id: groupId }));
    }
  }

  /** Ensure the consumer is subscribed to an org announcements channel. Call when entering OrgAnnouncementsScreen. */
  subscribeOrg(orgId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe_org', org_id: orgId }));
    }
  }

  /**
   * Send a message over the WebSocket.
   * Returns 'sent' if delivered immediately, 'queued' if WS is offline.
   * Queued messages are drained automatically on the next successful reconnect.
   */
  sendMessage(payload: {
    type: 'send_message';
    content: string;
    recipient_id?: string;
    group_id?: string;
    client_msg_id: string;
  }): 'sent' | 'queued' {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return 'sent';
    }
    this.sendQueue.push({ ...payload, enqueuedAt: Date.now() });
    return 'queued';
  }

  /**
   * Remove a queued message by its client_msg_id.
   * Call when the user deletes a 'waiting' or 'failed' message.
   */
  removeFromQueue(clientMsgId: string): void {
    this.sendQueue = this.sendQueue.filter(q => q.client_msg_id !== clientMsgId);
  }

  /** Call on logout. */
  disconnect() {
    this.closing = true;
    this.sendQueue = []; // discard unsent messages on logout
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

  /**
   * On reconnect, flush the send queue.
   * Items within QUEUE_TTL_MS are sent; expired items emit send_error.
   */
  private _drainQueue() {
    if (!this.sendQueue.length) return;
    const now = Date.now();
    const queue = this.sendQueue;
    this.sendQueue = [];

    for (const item of queue) {
      const { enqueuedAt, ...payload } = item;
      if (now - enqueuedAt >= QUEUE_TTL_MS) {
        this.emit('send_error', {
          code: 'QUEUE_EXPIRED',
          detail: 'Message expired while offline.',
          client_msg_id: item.client_msg_id,
        });
      } else {
        this.ws!.send(JSON.stringify(payload));
        this.emit('queue_item_flushed', { client_msg_id: item.client_msg_id });
      }
    }
  }
}

export const wsManager = new WebSocketManager();
