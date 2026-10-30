// Network protocol: message types, encode/decode, validators and helpers.
import { MAX_CHAT_LENGTH, MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from './constants.js';
import { isWeaponId } from './weapons.js';

export const C2S = Object.freeze({
  JOIN: 'join',
  INPUT: 'input',
  CHAT: 'chat',
  BUY: 'buy',
  READY: 'ready',
  LEAVE: 'leave',
  HOST: 'host',
});

export const S2C = Object.freeze({
  WELCOME: 'welcome',
  SNAPSHOT: 'snapshot',
  EVENT: 'event',
  CHAT: 'chat',
  LOBBY: 'lobby',
  ERROR: 'error',
});

export const EVENT_KINDS = Object.freeze(['kill', 'bomb', 'round', 'join', 'leave', 'buy', 'fx']);

export const MAX_CLIENT_MESSAGE_BYTES = 1024;
export const MAX_SERVER_MESSAGE_BYTES = 65536;
export const DEFAULT_PLAYER_NAME = 'Oyinchi';

export const ERROR_CODES = Object.freeze({
  BAD_MESSAGE: 'bad_message',
  TOO_LARGE: 'too_large',
  UNKNOWN_TYPE: 'unknown_type',
  ROOM_NOT_FOUND: 'room_not_found',
  ROOM_FULL: 'room_full',
  RATE_LIMIT: 'rate_limit',
  NOT_HOST: 'not_host',
  NOT_READY: 'not_ready',
  KICKED: 'kicked',
  BAD_STATE: 'bad_state',
});

export const ERROR_MESSAGES_UZ = Object.freeze({
  bad_message: 'Noto\'g\'ri xabar',
  too_large: 'Xabar juda katta',
  unknown_type: 'Noma\'lum xabar turi',
  room_not_found: 'Xona topilmadi',
  room_full: 'Xona to\'la',
  rate_limit: 'Juda tez yuboryapsiz',
  not_host: 'Faqat xona egasi buni qila oladi',
  not_ready: 'Hamma o\'yinchi tayyor emas',
  kicked: 'Siz xonadan chiqarildingiz',
  bad_state: 'Hozir bu amalni bajarib bo\'lmaydi',
});

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
export const DIFFICULTY_IDS = Object.freeze(['oson', 'orta', 'qiyin']);
export const HOST_ACTIONS = Object.freeze(['addBot', 'removeBot', 'difficulty', 'kick', 'start']);
const MAX_TOKEN_LENGTH = 64;
const SLOT_NAMES = ['primary', 'secondary', 'knife', 'smoke', 'flash', 'he'];

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

/** Strips control characters and angle brackets, collapses spaces and truncates. */
export function sanitizeName(raw) {
  if (typeof raw !== 'string') return DEFAULT_PLAYER_NAME;
  const cleaned = raw
    .replace(CONTROL_CHARS, '')
    .replace(/[<>&"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : DEFAULT_PLAYER_NAME;
}

export function sanitizeChat(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(CONTROL_CHARS, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHAT_LENGTH);
}

/** Generates a room code of ROOM_CODE_LENGTH characters. rng returns a number in [0, 1). */
export function generateRoomCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_ALPHABET[Math.min(ROOM_ALPHABET.length - 1, Math.floor(rng() * ROOM_ALPHABET.length))];
  }
  return code;
}

export function normalizeRoomCode(raw) {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

export function isValidRoomCode(raw) {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(raw));
}

export function encode(message) {
  return JSON.stringify(message);
}

/**
 * Parses and size-checks a raw JSON message.
 * @returns {{ok:true, message:object}|{ok:false, error:string}}
 */
export function decode(raw, maxBytes = MAX_SERVER_MESSAGE_BYTES) {
  if (typeof raw !== 'string') return { ok: false, error: ERROR_CODES.BAD_MESSAGE };
  if (byteLength(raw) > maxBytes) return { ok: false, error: ERROR_CODES.TOO_LARGE };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: ERROR_CODES.BAD_MESSAGE };
  }
  if (!isObject(parsed) || typeof parsed.t !== 'string') return { ok: false, error: ERROR_CODES.BAD_MESSAGE };
  return { ok: true, message: parsed };
}

function bad(error = ERROR_CODES.BAD_MESSAGE) {
  return { ok: false, error };
}

const validators = {
  [C2S.JOIN](m) {
    let room = '';
    if (m.room !== undefined && m.room !== null && m.room !== '') {
      if (!isValidRoomCode(m.room)) return bad(ERROR_CODES.ROOM_NOT_FOUND);
      room = normalizeRoomCode(m.room);
    }
    let token = '';
    if (m.token !== undefined && m.token !== null && m.token !== '') {
      if (typeof m.token !== 'string' || m.token.length > MAX_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(m.token)) return bad();
      token = m.token;
    }
    return { ok: true, value: { t: C2S.JOIN, name: sanitizeName(m.name), room, token } };
  },
  [C2S.INPUT](m) {
    if (!Number.isInteger(m.seq) || m.seq < 0 || m.seq > 0x7fffffff) return bad();
    if (!isFiniteNumber(m.mx) || !isFiniteNumber(m.mz) || Math.abs(m.mx) > 1 || Math.abs(m.mz) > 1) return bad();
    if (!isFiniteNumber(m.yaw) || Math.abs(m.yaw) > 1000) return bad();
    if (!isFiniteNumber(m.pitch) || Math.abs(m.pitch) > Math.PI / 2 + 0.01) return bad();
    for (const flag of ['jump', 'fire', 'reload', 'walk', 'use', 'scope']) {
      if (m[flag] !== undefined && typeof m[flag] !== 'boolean') return bad();
    }
    if (m.slot !== undefined && m.slot !== null && !SLOT_NAMES.includes(m.slot)) return bad();
    if (m.throw !== undefined && m.throw !== null && !['smoke', 'flash', 'he'].includes(m.throw)) return bad();
    return {
      ok: true,
      value: {
        t: C2S.INPUT,
        seq: m.seq,
        mx: m.mx,
        mz: m.mz,
        yaw: m.yaw,
        pitch: m.pitch,
        jump: m.jump === true,
        fire: m.fire === true,
        reload: m.reload === true,
        walk: m.walk === true,
        use: m.use === true,
        scope: m.scope === true,
        slot: m.slot ?? null,
        throw: m.throw ?? null,
      },
    };
  },
  [C2S.CHAT](m) {
    if (typeof m.text !== 'string') return bad();
    const text = sanitizeChat(m.text);
    if (text.length === 0) return bad();
    return { ok: true, value: { t: C2S.CHAT, text } };
  },
  [C2S.BUY](m) {
    if (!isWeaponId(m.item) || m.item === 'knife') return bad();
    return { ok: true, value: { t: C2S.BUY, item: m.item } };
  },
  [C2S.READY](m) {
    if (typeof m.ready !== 'boolean') return bad();
    return { ok: true, value: { t: C2S.READY, ready: m.ready } };
  },
  [C2S.LEAVE]() {
    return { ok: true, value: { t: C2S.LEAVE } };
  },
  [C2S.HOST](m) {
    if (!HOST_ACTIONS.includes(m.action)) return bad();
    const value = { t: C2S.HOST, action: m.action };
    if (m.action === 'difficulty') {
      if (!DIFFICULTY_IDS.includes(m.value)) return bad();
      value.value = m.value;
    }
    if (m.action === 'kick' || m.action === 'removeBot') {
      if (m.action === 'kick' && (typeof m.id !== 'string' || m.id.length === 0 || m.id.length > 32)) return bad();
      if (m.action === 'removeBot' && m.id !== undefined && (typeof m.id !== 'string' || m.id.length > 32)) return bad();
      value.id = m.id ?? '';
    }
    if (m.action === 'addBot' && m.team !== undefined && m.team !== 'CT' && m.team !== 'T') return bad();
    if (m.action === 'addBot') value.team = m.team ?? '';
    return { ok: true, value };
  },
};

/** Validates an already decoded client message. Returns {ok, value} or {ok:false, error}. */
export function validateClientMessage(message) {
  if (!isObject(message) || typeof message.t !== 'string') return bad();
  if (!Object.prototype.hasOwnProperty.call(validators, message.t)) return bad(ERROR_CODES.UNKNOWN_TYPE);
  return validators[message.t](message);
}

/** Decodes and validates a raw string coming from a client. */
export function parseClientMessage(raw) {
  const decoded = decode(raw, MAX_CLIENT_MESSAGE_BYTES);
  if (!decoded.ok) return decoded;
  return validateClientMessage(decoded.message);
}

/** Light structural validation of server messages on the client side. */
export function validateServerMessage(message) {
  if (!isObject(message) || typeof message.t !== 'string') return bad();
  switch (message.t) {
    case S2C.WELCOME:
      if (typeof message.id !== 'string' || !isValidRoomCode(message.room)) return bad();
      return { ok: true, value: message };
    case S2C.SNAPSHOT:
      if (!Number.isInteger(message.tick) || !Array.isArray(message.players)) return bad();
      return { ok: true, value: message };
    case S2C.EVENT:
      if (!EVENT_KINDS.includes(message.kind)) return bad();
      return { ok: true, value: message };
    case S2C.CHAT:
      if (typeof message.from !== 'string' || typeof message.text !== 'string') return bad();
      return { ok: true, value: message };
    case S2C.LOBBY:
      if (!Array.isArray(message.players) || typeof message.host !== 'string') return bad();
      return { ok: true, value: message };
    case S2C.ERROR:
      if (typeof message.code !== 'string') return bad();
      return { ok: true, value: message };
    default:
      return bad(ERROR_CODES.UNKNOWN_TYPE);
  }
}

export function errorMessage(code, text = ERROR_MESSAGES_UZ[code] ?? ERROR_MESSAGES_UZ.bad_message) {
  return { t: S2C.ERROR, code, text };
}
