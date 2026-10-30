// WebSocket client: connects to a room, parses server messages and retries after unexpected drops.
import { C2S, S2C, decode, encode, validateServerMessage, ERROR_MESSAGES_UZ, normalizeRoomCode } from '@konter/shared';

export const MAX_RECONNECT_ATTEMPTS = 8;
export const PING_INTERVAL_MS = 2000;
const TOKEN_KEY = 'konter.session.v1';

/** WebSocket endpoint for the page. The Vite dev server (5173) forwards /ws to the game server. */
export function serverUrl(loc = globalThis.location) {
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${loc.host}/ws`;
}

/** Reads ?room=CODE from a page URL. Returns '' when absent or malformed. */
export function roomFromUrl(search = globalThis.location?.search ?? '') {
  const code = normalizeRoomCode(new URLSearchParams(search).get('room') ?? '');
  return /^[A-Z0-9]{5}$/.test(code) ? code : '';
}

/** Link a host can share so friends land directly in the room. */
export function shareLink(code, loc = globalThis.location) {
  return `${loc.origin}${loc.pathname}?room=${code}`;
}

export function reconnectDelay(attempt) {
  return Math.min(5000, 700 * 2 ** (attempt - 1));
}

export class NetClient {
  constructor({ url = serverUrl(), socketFactory = (u) => new WebSocket(u), storage = globalThis.sessionStorage } = {}) {
    this.url = url;
    this.socketFactory = socketFactory;
    this.storage = storage;
    this.ws = null;
    this.listeners = new Map();
    this.session = null; // { room, token, name }
    this.id = '';
    this.room = '';
    this.isHost = false;
    this.wantClose = false;
    this.attempt = 0;
    this.retryTimer = null;
    this.pingTimer = null;
    this.pingMs = 0;
    this.sentAt = new Map();
    this.joined = false;
  }

  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
    return () => this.listeners.get(name).delete(fn);
  }

  emit(name, arg) {
    const set = this.listeners.get(name);
    if (set) for (const fn of [...set]) fn(arg);
  }

  get connected() {
    return this.ws !== null && this.ws.readyState === 1;
  }

  /**
   * Opens the socket and joins (or creates, when room is empty) a room.
   * Resolves with the welcome message, rejects with an Uzbek error text.
   */
  join(name, room = '') {
    this.wantClose = false;
    this.attempt = 0;
    this.joined = false;
    const saved = this.loadSession();
    const token = saved && saved.room === normalizeRoomCode(room) ? saved.token : '';
    this.session = { room: normalizeRoomCode(room), token, name };
    return new Promise((resolve, reject) => {
      const offWelcome = this.on('welcome', (m) => { offWelcome(); offError(); offFail(); resolve(m); });
      const offError = this.on('error', (m) => { offWelcome(); offError(); offFail(); reject(new Error(m.text)); });
      const offFail = this.on('failed', (text) => { offWelcome(); offError(); offFail(); reject(new Error(text)); });
      this.open();
    });
  }

  open() {
    let ws;
    try {
      ws = this.socketFactory(this.url);
    } catch {
      this.handleClose();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.sendRaw({ t: C2S.JOIN, name: this.session.name, room: this.session.room, token: this.session.token });
    };
    ws.onmessage = (ev) => this.handleMessage(ev.data);
    ws.onclose = () => { if (this.ws === ws) this.handleClose(); };
    ws.onerror = () => {};
  }

  handleMessage(raw) {
    const decoded = decode(raw);
    if (!decoded.ok) return;
    const valid = validateServerMessage(decoded.message);
    if (!valid.ok) return;
    const m = valid.value;
    switch (m.t) {
      case S2C.WELCOME: {
        const reconnected = this.joined;
        this.joined = true;
        this.attempt = 0;
        this.id = m.id;
        this.room = m.room;
        this.isHost = m.host;
        this.session = { room: m.room, token: m.token, name: this.session.name };
        this.saveSession();
        this.startPing();
        this.emit('welcome', m);
        if (reconnected) this.emit('reconnected', m);
        break;
      }
      case S2C.SNAPSHOT: {
        this.acknowledge(m);
        this.emit('snapshot', m);
        break;
      }
      case S2C.LOBBY:
        this.isHost = m.host === this.id;
        this.emit('lobby', m);
        break;
      case S2C.ERROR:
        if (m.code === 'kicked' || m.code === 'room_not_found' || m.code === 'room_full') {
          this.wantClose = true;
          this.clearSession();
        }
        this.emit('error', { code: m.code, text: m.text || ERROR_MESSAGES_UZ[m.code] || ERROR_MESSAGES_UZ.bad_message });
        break;
      default:
        this.emit(m.t, m);
    }
  }

  /** Round trip time: time between sending an input and the snapshot that confirms it. */
  acknowledge(snap) {
    const me = snap.players.find((p) => p.id === this.id);
    if (!me) return;
    const now = performance.now();
    let best = -1;
    for (const [seq, t] of this.sentAt) {
      if (seq <= me.seq) {
        best = t;
        this.sentAt.delete(seq);
      }
    }
    if (best >= 0) {
      const rtt = now - best;
      this.pingMs = this.pingMs === 0 ? rtt : this.pingMs * 0.8 + rtt * 0.2;
    }
  }

  startPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.connected) this.sendRaw({ t: C2S.PING, ms: Math.min(9999, Math.round(this.pingMs)) });
    }, PING_INTERVAL_MS);
  }

  handleClose() {
    clearInterval(this.pingTimer);
    this.ws = null;
    if (this.wantClose) {
      this.emit('closed', null);
      return;
    }
    if (!this.joined && !this.session.token) {
      this.emit('failed', 'Serverga ulanib bo\'lmadi');
      return;
    }
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    this.attempt += 1;
    if (this.attempt > MAX_RECONNECT_ATTEMPTS) {
      this.emit('failed', 'Server bilan aloqa tiklanmadi');
      this.clearSession();
      return;
    }
    const delay = reconnectDelay(this.attempt);
    this.emit('reconnecting', { attempt: this.attempt, max: MAX_RECONNECT_ATTEMPTS, delay });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  sendRaw(message) {
    if (this.connected) this.ws.send(encode(message));
  }

  sendInput(cmd) {
    this.sentAt.set(cmd.seq, performance.now());
    if (this.sentAt.size > 120) this.sentAt.delete(this.sentAt.keys().next().value);
    this.sendRaw({ t: C2S.INPUT, ...cmd });
  }

  chat(text) { this.sendRaw({ t: C2S.CHAT, text }); }
  buy(item) { this.sendRaw({ t: C2S.BUY, item }); }
  ready(ready) { this.sendRaw({ t: C2S.READY, ready }); }
  host(action, extra = {}) { this.sendRaw({ t: C2S.HOST, action, ...extra }); }

  leave() {
    this.wantClose = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    this.sendRaw({ t: C2S.LEAVE });
    this.clearSession();
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.close();
    }
    this.joined = false;
  }

  loadSession() {
    try {
      return JSON.parse(this.storage?.getItem(TOKEN_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  saveSession() {
    try {
      this.storage?.setItem(TOKEN_KEY, JSON.stringify(this.session));
    } catch {
      // Session storage may be unavailable; reconnect then only works within this page lifetime.
    }
  }

  clearSession() {
    try {
      this.storage?.removeItem(TOKEN_KEY);
    } catch {
      // Nothing to clear when storage is unavailable.
    }
  }
}
