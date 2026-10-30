// Rooms manager: creates rooms by 5 character code, routes messages and runs the 30 Hz tick loop.
import { randomBytes } from 'node:crypto';
import {
  C2S, ERROR_CODES, TICK_RATE, errorMessage, encode, generateRoomCode, normalizeRoomCode, parseClientMessage,
} from '@konter/shared';
import { Room } from './room.js';
import { checkSize, createGuard } from './validation.js';

export const MAX_ROOMS = 200;
export const MAX_CONNECTIONS = 1000;
export const MAX_CONNECTIONS_PER_IP = 8;
export const MAX_ROOMS_PER_IP = 2;

function defaultToken() {
  return randomBytes(16).toString('hex');
}

export class RoomManager {
  /**
   * @param {{rng?:()=>number, makeToken?:()=>string, now?:()=>number, maxRooms?:number, maxConnections?:number, maxPerIp?:number, maxRoomsPerIp?:number}} options
   */
  constructor({ rng = Math.random, makeToken = defaultToken, now = Date.now, maxRooms = MAX_ROOMS,
    maxConnections = MAX_CONNECTIONS, maxPerIp = MAX_CONNECTIONS_PER_IP, maxRoomsPerIp = MAX_ROOMS_PER_IP,
  } = {}) {
    this.rng = rng;
    this.makeToken = makeToken;
    this.now = now;
    this.maxRooms = maxRooms;
    this.maxConnections = maxConnections;
    this.maxPerIp = maxPerIp;
    this.maxRoomsPerIp = maxRoomsPerIp;
    this.connections = 0;
    this.connectionsByIp = new Map();
    this.rooms = new Map();
    this.timer = null;
  }

  get roomCount() {
    return this.rooms.size;
  }

  get playerCount() {
    let n = 0;
    for (const r of this.rooms.values()) n += r.humans().length;
    return n;
  }

  getRoom(code) {
    return this.rooms.get(normalizeRoomCode(code)) ?? null;
  }

  uniqueCode() {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode(this.rng);
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  roomsCreatedBy(ip) {
    let n = 0;
    for (const r of this.rooms.values()) if (r.creatorIp === ip) n += 1;
    return n;
  }

  createRoom(ip = '') {
    if (this.rooms.size >= this.maxRooms) return null;
    if (ip && this.roomsCreatedBy(ip) >= this.maxRoomsPerIp) return null;
    const code = this.uniqueCode();
    if (!code) return null;
    const room = new Room(code, {
      seed: Math.floor(this.rng() * 0x7fffffff),
      makeToken: this.makeToken,
      onEmpty: (r) => this.rooms.delete(r.code),
    });
    room.creatorIp = ip;
    this.rooms.set(code, room);
    return room;
  }

  /**
   * Wraps a transport ({send(text), close(), ip?}) into a client session.
   * Returns null when the global or per-IP connection limit is reached.
   */
  connect(conn) {
    const ip = conn.ip ?? '';
    if (this.connections >= this.maxConnections) return null;
    if (ip && (this.connectionsByIp.get(ip) ?? 0) >= this.maxPerIp) return null;
    this.connections += 1;
    if (ip) this.connectionsByIp.set(ip, (this.connectionsByIp.get(ip) ?? 0) + 1);
    return { conn, ip, guard: createGuard(this.now), room: null, memberId: null, released: false };
  }

  releaseConnection(client) {
    if (client.released) return;
    client.released = true;
    this.connections = Math.max(0, this.connections - 1);
    if (!client.ip) return;
    const left = (this.connectionsByIp.get(client.ip) ?? 1) - 1;
    if (left > 0) this.connectionsByIp.set(client.ip, left);
    else this.connectionsByIp.delete(client.ip);
  }

  reply(client, message) {
    client.conn.send(encode(message));
  }

  /** Handles one raw message from a client. Never throws on bad input. */
  handleMessage(client, raw) {
    const size = checkSize(raw);
    if (!size.ok) { this.reject(client, size.error); return; }
    const text = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
    const parsed = parseClientMessage(text);
    if (!parsed.ok) { this.reject(client, parsed.error); return; }
    const msg = parsed.value;
    const rate = client.guard.check(msg.t);
    if (!rate.ok) { this.reject(client, rate.error, false); return; }

    if (msg.t === C2S.JOIN) { this.handleJoin(client, msg); return; }
    const room = client.room;
    if (!room || !client.memberId) { this.reject(client, ERROR_CODES.BAD_STATE); return; }
    switch (msg.t) {
      case C2S.INPUT: room.input(client.memberId, msg); break;
      case C2S.CHAT: room.chat(client.memberId, msg.text); break;
      case C2S.BUY: room.buy(client.memberId, msg.item); break;
      case C2S.READY: room.setReady(client.memberId, msg.ready); break;
      case C2S.HOST: room.hostAction(client.memberId, msg); break;
      case C2S.TEAM: room.setTeam(client.memberId, msg.team); break;
      case C2S.PING: room.setPing(client.memberId, msg.ms); break;
      case C2S.LEAVE: this.handleLeave(client); break;
      default: break;
    }
  }

  reject(client, code, countViolation = true) {
    if (countViolation) client.guard.violation();
    this.reply(client, errorMessage(code));
    if (client.guard.shouldClose && client.conn.close) client.conn.close();
  }

  handleJoin(client, msg) {
    if (client.room) { this.reject(client, ERROR_CODES.BAD_STATE); return; }
    let room;
    if (msg.room === '') {
      room = this.createRoom(client.ip);
      if (!room) { this.reject(client, ERROR_CODES.ROOM_FULL); return; }
    } else {
      room = this.getRoom(msg.room);
      if (!room) { this.reject(client, ERROR_CODES.ROOM_NOT_FOUND); return; }
    }
    const res = room.join(msg.name, client.conn, msg.token);
    if (!res.ok) {
      if (room.isEmpty()) this.rooms.delete(room.code);
      this.reject(client, res.error);
      return;
    }
    client.room = room;
    client.memberId = res.member.id;
  }

  handleLeave(client) {
    if (client.room && client.memberId) client.room.leave(client.memberId);
    client.room = null;
    client.memberId = null;
  }

  /** Transport closed. */
  handleClose(client) {
    this.releaseConnection(client);
    if (client.room && client.memberId) client.room.disconnect(client.memberId);
    client.room = null;
    client.memberId = null;
  }

  tick() {
    for (const room of [...this.rooms.values()]) {
      try {
        room.tick();
      } catch (err) {
        this.destroyRoom(room, err);
      }
    }
  }

  /** A room whose tick threw is closed so the other rooms and the process keep running. */
  destroyRoom(room, err) {
    console.error(`room ${room.code} failed and was closed:`, err);
    this.rooms.delete(room.code);
    for (const m of room.humans()) {
      try {
        if (m.client) {
          m.client.send(encode(errorMessage(ERROR_CODES.BAD_STATE)));
          if (m.client.close) m.client.close();
        }
      } catch {
        // The socket is already gone; nothing more to notify.
      }
    }
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
