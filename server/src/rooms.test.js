import { describe, it, expect } from 'vitest';
import { generateRoomCode, isValidRoomCode } from '@konter/shared';
import { RoomManager } from './rooms.js';
import { MAX_PLAYERS, RECONNECT_GRACE_TICKS } from './room.js';

function fakeConn() {
  const conn = {
    messages: [], closed: false,
    send(text) { conn.messages.push(JSON.parse(text)); },
    close() { conn.closed = true; },
    last(type) { return [...conn.messages].reverse().find((m) => m.t === type); },
  };
  return conn;
}

let counter = 0;
function setup() {
  counter = 0;
  let seed = 1;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return new RoomManager({ rng, makeToken: () => `tok${++counter}`, now: () => 0 });
}

function connect(mgr) {
  const conn = fakeConn();
  return { conn, client: mgr.connect(conn) };
}

function send(mgr, c, msg) {
  mgr.handleMessage(c.client, JSON.stringify(msg));
}

function join(mgr, name, room = '') {
  const c = connect(mgr);
  c.client.guard = mgr.connect(c.conn).guard;
  send(mgr, c, { t: 'join', name, room });
  return c;
}

function fillRoom(mgr, n) {
  const host = join(mgr, 'Host');
  const code = host.conn.last('welcome').room;
  const others = [];
  for (let i = 1; i < n; i++) others.push(join(mgr, `P${i}`, code));
  return { host, code, others, room: mgr.getRoom(code) };
}

describe('create and join', () => {
  it('creates a room with a 5 character code and makes the first player host', () => {
    const mgr = setup();
    const a = join(mgr, 'Ali');
    const w = a.conn.last('welcome');
    expect(isValidRoomCode(w.room)).toBe(true);
    expect(w.room).toHaveLength(5);
    expect(w.host).toBe(true);
    expect(w.token).toBe('tok1');
    expect(mgr.roomCount).toBe(1);
  });

  it('joins an existing room by code and balances teams', () => {
    const mgr = setup();
    const { code, room } = fillRoom(mgr, 6);
    expect(room.teamMembers('CT')).toHaveLength(3);
    expect(room.teamMembers('T')).toHaveLength(3);
    expect(mgr.getRoom(code.toLowerCase())).toBe(room);
  });

  it('reports an unknown room', () => {
    const mgr = setup();
    const c = join(mgr, 'Ali', generateRoomCode(() => 0.5));
    expect(c.conn.last('error').code).toBe('room_not_found');
  });

  it('rejects an 11th player when the room is full', () => {
    const mgr = setup();
    const { code, room } = fillRoom(mgr, MAX_PLAYERS);
    expect(room.humans()).toHaveLength(10);
    const extra = join(mgr, 'Late', code);
    expect(extra.conn.last('error').code).toBe('room_full');
    expect(room.humans()).toHaveLength(10);
  });

  it('rejects malformed messages without throwing', () => {
    const mgr = setup();
    const c = connect(mgr);
    mgr.handleMessage(c.client, '{bad');
    mgr.handleMessage(c.client, JSON.stringify({ t: 'input' }));
    mgr.handleMessage(c.client, 'x'.repeat(5000));
    expect(c.conn.messages.every((m) => m.t === 'error')).toBe(true);
    expect(c.conn.messages).toHaveLength(3);
  });
});

describe('host', () => {
  it('migrates the host when the host leaves', () => {
    const mgr = setup();
    const { host, others, room } = fillRoom(mgr, 3);
    send(mgr, host, { t: 'leave' });
    const second = others[0].conn.last('lobby');
    expect(second.host).toBe(room.host);
    expect(room.host).not.toBe('p1');
    expect(room.humans()).toHaveLength(2);
    expect(others[0].conn.last('lobby').players.find((p) => p.host).name).toBe('P1');
  });

  it('migrates the host when the host socket closes in the lobby', () => {
    const mgr = setup();
    const { host, room } = fillRoom(mgr, 2);
    mgr.handleClose(host.client);
    expect(room.host).toBe('p2');
  });

  it('removes the room when the last human leaves', () => {
    const mgr = setup();
    const { host } = fillRoom(mgr, 1);
    mgr.handleClose(host.client);
    expect(mgr.roomCount).toBe(0);
  });

  it('only the host can add bots, kick and set difficulty', () => {
    const mgr = setup();
    const { host, others, room } = fillRoom(mgr, 3);
    send(mgr, others[0], { t: 'host', action: 'addBot' });
    expect(others[0].conn.last('error').code).toBe('not_host');
    send(mgr, others[0], { t: 'host', action: 'difficulty', value: 'qiyin' });
    expect(room.difficulty).toBe('orta');
    send(mgr, host, { t: 'host', action: 'difficulty', value: 'qiyin' });
    expect(room.difficulty).toBe('qiyin');
    send(mgr, host, { t: 'host', action: 'addBot', team: 'T' });
    expect(room.bots()).toHaveLength(1);
    expect(room.bots()[0].team).toBe('T');
    send(mgr, host, { t: 'host', action: 'removeBot' });
    expect(room.bots()).toHaveLength(0);
  });

  it('kicks a player who cannot rejoin with the same token', () => {
    const mgr = setup();
    const { host, others, code, room } = fillRoom(mgr, 3);
    const token = others[0].conn.last('welcome').token;
    send(mgr, host, { t: 'host', action: 'kick', id: 'p2' });
    expect(others[0].conn.closed).toBe(true);
    expect(others[0].conn.last('error').code).toBe('kicked');
    expect(room.humans()).toHaveLength(2);
    const again = connect(mgr);
    send(mgr, again, { t: 'join', name: 'P1', room: code, token });
    expect(again.conn.last('error').code).toBe('kicked');
  });

  it('cannot kick yourself', () => {
    const mgr = setup();
    const { host, room } = fillRoom(mgr, 2);
    send(mgr, host, { t: 'host', action: 'kick', id: 'p1' });
    expect(room.humans()).toHaveLength(2);
  });
});

describe('ready, chat and start', () => {
  it('needs everybody ready before the host starts, then fills bots to 5v5', () => {
    const mgr = setup();
    const { host, others, room } = fillRoom(mgr, 3);
    send(mgr, host, { t: 'host', action: 'start' });
    expect(host.conn.last('error').code).toBe('not_ready');
    expect(room.state).toBe('lobby');
    for (const o of others) send(mgr, o, { t: 'ready', ready: true });
    send(mgr, host, { t: 'host', action: 'start' });
    expect(room.state).toBe('playing');
    expect(room.teamMembers('CT')).toHaveLength(5);
    expect(room.teamMembers('T')).toHaveLength(5);
    expect(room.bots()).toHaveLength(7);
    expect(room.sim.players.size).toBe(10);
  });

  it('broadcasts lobby chat sanitized', () => {
    const mgr = setup();
    const { host, others } = fillRoom(mgr, 2);
    send(mgr, host, { t: 'chat', text: ' <b>salom</b> ' });
    const msg = others[0].conn.last('chat');
    expect(msg.text).toBe('bsalom/b');
    expect(msg.from).toBe('Host');
  });
});

describe('bots replace humans', () => {
  function playing() {
    const mgr = setup();
    const ctx = fillRoom(mgr, 3);
    for (const o of ctx.others) send(mgr, o, { t: 'ready', ready: true });
    send(mgr, ctx.host, { t: 'host', action: 'start' });
    return { mgr, ...ctx };
  }

  it('a leaving human is replaced by a bot in the running game', () => {
    const { mgr, others, room } = playing();
    send(mgr, others[0], { t: 'leave' });
    expect(room.humans()).toHaveLength(2);
    expect(room.members.get('p2').isBot).toBe(true);
    expect(room.sim.players.get('p2').isBot).toBe(true);
    expect(room.members.size).toBe(10);
  });

  it('a joining human replaces a bot', () => {
    const { mgr, code, room } = playing();
    expect(room.members.size).toBe(10);
    const late = join(mgr, 'Late', code);
    expect(late.conn.last('welcome')).toBeDefined();
    expect(room.members.size).toBe(10);
    expect(room.humans()).toHaveLength(4);
    expect(room.bots()).toHaveLength(6);
    expect(room.sim.players.size).toBe(10);
    expect(room.sim.players.get('p4').isBot).toBe(false);
  });

  it('a dropped connection is played by a bot and can reconnect with the token', () => {
    const { mgr, code, others, room } = playing();
    const token = others[0].conn.last('welcome').token;
    mgr.handleClose(others[0].client);
    expect(room.members.get('p2').connected).toBe(false);
    expect(room.sim.players.get('p2').isBot).toBe(true);
    const back = connect(mgr);
    send(mgr, back, { t: 'join', name: 'P1', room: code, token });
    expect(back.conn.last('welcome').id).toBe('p2');
    expect(room.sim.players.get('p2').isBot).toBe(false);
    expect(room.humans()).toHaveLength(3);
  });

  it('gives up the slot after the reconnect grace period', () => {
    const { mgr, others, room } = playing();
    mgr.handleClose(others[1].client);
    for (let i = 0; i < RECONNECT_GRACE_TICKS + 2; i++) mgr.tick();
    expect(room.members.get('p3').isBot).toBe(true);
    expect(room.humans()).toHaveLength(2);
  });

  it('host migration works during a game', () => {
    const { mgr, host, room } = playing();
    send(mgr, host, { t: 'leave' });
    expect(room.host).toBe('p2');
  });

  it('ticks the simulation and broadcasts snapshots to humans', () => {
    const { mgr, host } = playing();
    for (let i = 0; i < 5; i++) mgr.tick();
    const snaps = host.conn.messages.filter((m) => m.t === 'snapshot');
    expect(snaps).toHaveLength(5);
    expect(snaps[4].players).toHaveLength(10);
  });

  it('applies validated input and buy messages', () => {
    const { mgr, host, room } = playing();
    mgr.tick();
    send(mgr, host, {
      t: 'input', seq: 7, mx: 0, mz: 1, yaw: 0, pitch: 0, jump: false, fire: false,
    });
    mgr.tick();
    expect(room.sim.players.get('p1').lastSeq).toBe(7);
    room.sim.players.get('p1').inv.money = 5000;
    send(mgr, host, { t: 'buy', item: 'ak47' });
    const p1 = room.sim.players.get('p1');
    expect(p1.inv.primary === 'ak47' || p1.team === 'CT').toBe(true);
  });

  it('rate limits input floods', () => {
    const { mgr, host } = playing();
    const input = { t: 'input', seq: 1, mx: 0, mz: 0, yaw: 0, pitch: 0 };
    for (let i = 0; i < 400; i++) send(mgr, host, input);
    expect(host.conn.messages.some((m) => m.t === 'error' && m.code === 'rate_limit')).toBe(true);
  });
});

describe('ping and team selection', () => {
  it('stores the client reported ping and publishes it in the lobby', () => {
    const mgr = setup();
    const a = join(mgr, 'Ali');
    send(mgr, a, { t: 'ping', ms: 42 });
    mgr.getRoom(a.conn.last('welcome').room).broadcastLobby();
    const me = a.conn.last('lobby').players.find((p) => p.name === 'Ali');
    expect(me.ping).toBe(42);
  });

  it('rejects a malformed ping', () => {
    const mgr = setup();
    const a = join(mgr, 'Ali');
    send(mgr, a, { t: 'ping', ms: -5 });
    expect(a.conn.last('error').code).toBe('bad_message');
  });

  it('moves a player to the requested team and supports auto balance', () => {
    const mgr = setup();
    const a = join(mgr, 'Ali');
    const room = mgr.getRoom(a.conn.last('welcome').room);
    const id = a.conn.last('welcome').id;
    const other = room.members.get(id).team === 'CT' ? 'T' : 'CT';
    send(mgr, a, { t: 'team', team: other });
    expect(room.members.get(id).team).toBe(other);
    send(mgr, a, { t: 'team', team: 'auto' });
    expect(room.members.get(id).team).toBe('CT');
  });

  it('replaces a bot when the chosen team is full and refuses when humans fill it', () => {
    const mgr = setup();
    const a = join(mgr, 'Ali');
    const room = mgr.getRoom(a.conn.last('welcome').room);
    const id = a.conn.last('welcome').id;
    room.members.get(id).team = 'T';
    for (let i = 0; i < 5; i++) room.addBot(room.members.get(id), 'CT');
    send(mgr, a, { t: 'team', team: 'CT' });
    expect(room.members.get(id).team).toBe('CT');
    expect(room.teamMembers('CT')).toHaveLength(5);
    expect(room.teamMembers('CT').filter((m) => m.isBot)).toHaveLength(4);
  });

  it('blocks a kicked player who rejoins from the same address without a token', () => {
    const mgr = setup();
    const { host, others, code } = fillRoom(mgr, 3);
    others[0].conn.ip = '10.0.0.5';
    send(mgr, host, { t: 'host', action: 'kick', id: 'p2' });
    const again = { conn: fakeConn() };
    again.conn.ip = '10.0.0.5';
    again.client = mgr.connect(again.conn);
    send(mgr, again, { t: 'join', name: 'P1', room: code });
    expect(again.conn.last('error').code).toBe('kicked');
  });

  it('limits connections globally and per address', () => {
    const mgr = new RoomManager({ maxConnections: 3, maxPerIp: 2, now: () => 0 });
    const a = { ip: '1.1.1.1' };
    const c1 = mgr.connect(a);
    expect(mgr.connect(a)).not.toBeNull();
    expect(mgr.connect(a)).toBeNull();
    expect(mgr.connect({ ip: '2.2.2.2' })).not.toBeNull();
    expect(mgr.connect({ ip: '3.3.3.3' })).toBeNull();
    mgr.handleClose(c1);
    expect(mgr.connect({ ip: '3.3.3.3' })).not.toBeNull();
  });

  it('limits rooms created per address', () => {
    const mgr = new RoomManager({ maxRoomsPerIp: 1, now: () => 0 });
    const first = { conn: fakeConn() };
    first.conn.ip = '9.9.9.9';
    first.client = mgr.connect(first.conn);
    send(mgr, first, { t: 'join', name: 'A', room: '' });
    expect(first.conn.last('welcome')).toBeDefined();
    const second = { conn: fakeConn() };
    second.conn.ip = '9.9.9.9';
    second.client = mgr.connect(second.conn);
    send(mgr, second, { t: 'join', name: 'B', room: '' });
    expect(second.conn.last('error').code).toBe('room_full');
  });

  it('closes only the room whose tick throws', () => {
    const mgr = setup();
    const bad = join(mgr, 'Bad');
    const good = join(mgr, 'Good');
    const badRoom = bad.client.room;
    badRoom.tick = () => { throw new Error('boom'); };
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => mgr.tick()).not.toThrow();
    } finally {
      console.error = originalError;
    }
    expect(mgr.getRoom(badRoom.code)).toBeNull();
    expect(mgr.getRoom(good.client.room.code)).not.toBeNull();
    expect(bad.conn.closed).toBe(true);
  });
});
