import { describe, it, expect } from 'vitest';
import {
  C2S, ERROR_CODES, MAX_CLIENT_MESSAGE_BYTES, S2C, decode, encode, errorMessage, generateRoomCode,
  isValidRoomCode, parseClientMessage, sanitizeChat, sanitizeName, validateClientMessage,
  validateServerMessage,
} from './protocol.js';

const input = { t: 'input', seq: 3, mx: 1, mz: -1, yaw: 0.5, pitch: -0.2, fire: true };

describe('encode/decode', () => {
  it('round trips messages', () => {
    const msg = { t: 'chat', text: 'salom' };
    expect(decode(encode(msg))).toEqual({ ok: true, message: msg });
  });

  it('rejects invalid JSON, non-objects, missing type and oversize payloads', () => {
    expect(decode('{nope').error).toBe(ERROR_CODES.BAD_MESSAGE);
    expect(decode('[1,2]').ok).toBe(false);
    expect(decode('"x"').ok).toBe(false);
    expect(decode('{"a":1}').ok).toBe(false);
    expect(decode(42).ok).toBe(false);
    const big = encode({ t: 'chat', text: 'x'.repeat(MAX_CLIENT_MESSAGE_BYTES) });
    expect(decode(big, MAX_CLIENT_MESSAGE_BYTES).error).toBe(ERROR_CODES.TOO_LARGE);
  });
});

describe('client message validation', () => {
  it('accepts a valid input and fills defaults', () => {
    const r = validateClientMessage(input);
    expect(r.ok).toBe(true);
    expect(r.value.fire).toBe(true);
    expect(r.value.jump).toBe(false);
    expect(r.value.slot).toBe(null);
  });

  it('rejects malformed inputs', () => {
    expect(validateClientMessage({ ...input, seq: -1 }).ok).toBe(false);
    expect(validateClientMessage({ ...input, seq: 1.5 }).ok).toBe(false);
    expect(validateClientMessage({ ...input, mx: 2 }).ok).toBe(false);
    expect(validateClientMessage({ ...input, mz: NaN }).ok).toBe(false);
    expect(validateClientMessage({ ...input, yaw: 'a' }).ok).toBe(false);
    expect(validateClientMessage({ ...input, pitch: 3 }).ok).toBe(false);
    expect(validateClientMessage({ ...input, fire: 'yes' }).ok).toBe(false);
    expect(validateClientMessage({ ...input, slot: 'bazooka' }).ok).toBe(false);
    expect(validateClientMessage({ ...input, throw: 'knife' }).ok).toBe(false);
  });

  it('validates join with name sanitizing and room codes', () => {
    const ok = validateClientMessage({ t: C2S.JOIN, name: '  <b>Ali</b>  ', room: 'ab2cd' });
    expect(ok.ok).toBe(true);
    expect(ok.value.name).toBe('bAli/b');
    expect(ok.value.room).toBe('AB2CD');
    expect(validateClientMessage({ t: C2S.JOIN, name: 'Vali' }).value.room).toBe('');
    expect(validateClientMessage({ t: C2S.JOIN, name: 'Vali', room: 'bad' }).ok).toBe(false);
  });

  it('validates chat, buy, ready and leave', () => {
    expect(validateClientMessage({ t: C2S.CHAT, text: '  hello \n there ' }).value.text).toBe('hello there');
    expect(validateClientMessage({ t: C2S.CHAT, text: '   ' }).ok).toBe(false);
    expect(validateClientMessage({ t: C2S.CHAT, text: 5 }).ok).toBe(false);
    expect(validateClientMessage({ t: C2S.BUY, item: 'ak47' }).ok).toBe(true);
    expect(validateClientMessage({ t: C2S.BUY, item: 'rocket' }).ok).toBe(false);
    expect(validateClientMessage({ t: C2S.BUY, item: 'knife' }).ok).toBe(false);
    expect(validateClientMessage({ t: C2S.READY, ready: true }).ok).toBe(true);
    expect(validateClientMessage({ t: C2S.READY, ready: 1 }).ok).toBe(false);
    expect(validateClientMessage({ t: C2S.LEAVE }).ok).toBe(true);
  });

  it('rejects unknown types, including prototype keys', () => {
    expect(validateClientMessage({ t: 'hack' }).error).toBe(ERROR_CODES.UNKNOWN_TYPE);
    expect(validateClientMessage({ t: 'constructor' }).error).toBe(ERROR_CODES.UNKNOWN_TYPE);
    expect(validateClientMessage(null).ok).toBe(false);
    expect(validateClientMessage([]).ok).toBe(false);
  });

  it('parses raw strings with a size limit', () => {
    expect(parseClientMessage(encode(input)).ok).toBe(true);
    expect(parseClientMessage('x'.repeat(MAX_CLIENT_MESSAGE_BYTES + 1)).error).toBe(ERROR_CODES.TOO_LARGE);
    expect(parseClientMessage('not json').ok).toBe(false);
  });
});

describe('server message validation', () => {
  it('accepts well-formed server messages', () => {
    expect(validateServerMessage({ t: S2C.WELCOME, id: 'p1', room: 'ABCDE' }).ok).toBe(true);
    expect(validateServerMessage({ t: S2C.SNAPSHOT, tick: 4, players: [] }).ok).toBe(true);
    expect(validateServerMessage({ t: S2C.EVENT, kind: 'kill' }).ok).toBe(true);
    expect(validateServerMessage({ t: S2C.CHAT, from: 'a', text: 'b' }).ok).toBe(true);
    expect(validateServerMessage(errorMessage('room_full')).ok).toBe(true);
  });

  it('rejects malformed server messages', () => {
    expect(validateServerMessage({ t: S2C.WELCOME, id: 1, room: 'ABCDE' }).ok).toBe(false);
    expect(validateServerMessage({ t: S2C.SNAPSHOT, tick: 'x', players: [] }).ok).toBe(false);
    expect(validateServerMessage({ t: S2C.EVENT, kind: 'nuke' }).ok).toBe(false);
    expect(validateServerMessage({ t: 'zzz' }).ok).toBe(false);
  });

  it('writes errors in Uzbek', () => {
    expect(errorMessage('room_full').text).toBe('Xona to\'la');
  });
});

describe('names, chat and room codes', () => {
  it('sanitizes names', () => {
    expect(sanitizeName('')).toBe('Oyinchi');
    expect(sanitizeName(null)).toBe('Oyinchi');
    expect(sanitizeName('a'.repeat(40)).length).toBe(16);
    expect(sanitizeName('Bo\u0000b\n')).toBe('Bob');
    expect(sanitizeName('<>')).toBe('Oyinchi');
  });

  it('sanitizes chat text', () => {
    expect(sanitizeChat('<script>x</script>')).toBe('scriptx/script');
    expect(sanitizeChat('y'.repeat(500)).length).toBe(120);
  });

  it('generates 5 character room codes', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    expect(isValidRoomCode(code)).toBe(true);
    expect(generateRoomCode(() => 0)).toBe('AAAAA');
    expect(generateRoomCode(() => 0.999999)).toBe('99999');
    expect(isValidRoomCode('ABCD')).toBe(false);
    expect(isValidRoomCode('ABCDI')).toBe(false);
    expect(isValidRoomCode(12345)).toBe(false);
  });
});

describe('host and token messages', () => {
  it('validates host actions', () => {
    expect(validateClientMessage({ t: C2S.HOST, action: 'addBot', team: 'T' }).ok).toBe(true);
    expect(validateClientMessage({ t: C2S.HOST, action: 'difficulty', value: 'qiyin' }).ok).toBe(true);
    expect(validateClientMessage({ t: C2S.HOST, action: 'difficulty', value: 'hard' }).ok).toBe(false);
    expect(validateClientMessage({ t: C2S.HOST, action: 'kick' }).ok).toBe(false);
    expect(validateClientMessage({ t: C2S.HOST, action: 'kick', id: 'p2' }).value.id).toBe('p2');
    expect(validateClientMessage({ t: C2S.HOST, action: 'nuke' }).ok).toBe(false);
    expect(validateClientMessage({ t: C2S.HOST, action: 'start' }).ok).toBe(true);
  });

  it('accepts a reconnect token only in a safe format', () => {
    expect(validateClientMessage({ t: C2S.JOIN, name: 'a', token: 'abc_123-X' }).value.token).toBe('abc_123-X');
    expect(validateClientMessage({ t: C2S.JOIN, name: 'a', token: '<script>' }).ok).toBe(false);
    expect(validateClientMessage({ t: C2S.JOIN, name: 'a' }).value.token).toBe('');
  });

  it('validates lobby server messages', () => {
    expect(validateServerMessage({ t: S2C.LOBBY, host: 'p1', players: [] }).ok).toBe(true);
    expect(validateServerMessage({ t: S2C.LOBBY, players: [] }).ok).toBe(false);
  });
});
