// One game room: lobby, team balance, bots, host rights and the authoritative simulation.
import {
  ERROR_CODES, GameSim, S2C, TEAM_CT, TEAM_SIZE, TEAM_T, TICK_RATE, encode, errorMessage, sanitizeChat,
} from '@konter/shared';

export const MAX_PLAYERS = TEAM_SIZE * 2;
export const RECONNECT_GRACE_TICKS = 15 * TICK_RATE;
export const MATCH_END_TICKS = 8 * TICK_RATE;
export const STATE_LOBBY = 'lobby';
export const STATE_PLAYING = 'playing';

const BOT_NAMES = [
  'Anvar', 'Bobur', 'Dilshod', 'Eldor', 'Farrux', 'Gulom', 'Husan', 'Ibrohim', 'Jasur', 'Kamol',
  'Laziz', 'Mirzo', 'Nodir', 'Otabek', 'Pulat', 'Rustam', 'Sardor', 'Timur', 'Ulugbek', 'Zafar',
];

const EVENT_KIND = {
  kill: 'kill',
  planting: 'bomb', planted: 'bomb', beep: 'bomb', defusing: 'bomb', defused: 'bomb', exploded: 'bomb',
  live: 'round', round_start: 'round', round_end: 'round', match_end: 'round', sides_swapped: 'round',
  shot: 'fx', hit: 'fx', grenade: 'fx', pickup: 'fx',
};

export class Room {
  /**
   * @param {string} code 5 character room code
   * @param {{seed?:number, makeToken?:()=>string, onEmpty?:(room:Room)=>void}} options
   */
  constructor(code, { seed = 1, makeToken = () => Math.random().toString(36).slice(2), onEmpty = () => {} } = {}) {
    this.code = code;
    this.seed = seed;
    this.makeToken = makeToken;
    this.onEmpty = onEmpty;
    this.members = new Map();
    this.host = null;
    this.state = STATE_LOBBY;
    this.difficulty = 'orta';
    this.sim = null;
    this.nextId = 1;
    this.nextBot = 0;
    this.endTicks = 0;
    this.banned = new Set();
    this.tickCount = 0;
  }

  // ---- queries ---------------------------------------------------------------------------

  humans() {
    return [...this.members.values()].filter((m) => !m.isBot);
  }

  connectedHumans() {
    return this.humans().filter((m) => m.connected);
  }

  bots() {
    return [...this.members.values()].filter((m) => m.isBot);
  }

  teamMembers(team) {
    return [...this.members.values()].filter((m) => m.team === team);
  }

  isFull() {
    return this.humans().length >= MAX_PLAYERS;
  }

  isEmpty() {
    return this.humans().length === 0;
  }

  // ---- messaging -------------------------------------------------------------------------

  sendTo(member, message) {
    if (member.client && member.connected) member.client.send(typeof message === 'string' ? message : encode(message));
  }

  broadcast(message) {
    const text = typeof message === 'string' ? message : encode(message);
    for (const m of this.members.values()) if (m.client && m.connected) m.client.send(text);
  }

  sendError(member, code) {
    this.sendTo(member, errorMessage(code));
  }

  lobbyMessage() {
    return {
      t: S2C.LOBBY,
      room: this.code,
      host: this.host ?? '',
      state: this.state,
      difficulty: this.difficulty,
      players: [...this.members.values()].map((m) => ({
        id: m.id, name: m.name, team: m.team, ready: m.ready, bot: m.isBot, host: m.id === this.host, connected: m.connected,
      })),
    };
  }

  broadcastLobby() {
    this.broadcast(this.lobbyMessage());
  }

  // ---- joining and leaving ---------------------------------------------------------------

  /** Team for a new human. When the room is full of humans and bots the team with fewer humans wins. */
  pickTeam() {
    const count = (team) => this.teamMembers(team).length;
    const humansIn = (team) => this.teamMembers(team).filter((m) => !m.isBot).length;
    if (this.members.size >= MAX_PLAYERS) {
      return humansIn(TEAM_CT) <= humansIn(TEAM_T) ? TEAM_CT : TEAM_T;
    }
    if (count(TEAM_CT) !== count(TEAM_T)) return count(TEAM_CT) < count(TEAM_T) ? TEAM_CT : TEAM_T;
    return humansIn(TEAM_CT) <= humansIn(TEAM_T) ? TEAM_CT : TEAM_T;
  }

  /** Removes one bot (preferably from a team) to free a slot. Returns true when a bot was removed. */
  evictBot(team) {
    const bot = this.bots().reverse().find((b) => b.team === team) ?? this.bots().reverse()[0];
    if (!bot) return false;
    this.deleteMember(bot.id);
    return true;
  }

  deleteMember(id) {
    this.members.delete(id);
    if (this.sim) this.sim.removePlayer(id);
  }

  /**
   * Adds a human to the room.
   * @returns {{ok:true, member:object}|{ok:false, error:string}}
   */
  join(name, client, token = '') {
    if (token) {
      const existing = this.humans().find((m) => m.token === token);
      if (existing) return this.reconnect(existing, client);
      if (this.banned.has(token)) return { ok: false, error: ERROR_CODES.KICKED };
    }
    if (this.isFull()) return { ok: false, error: ERROR_CODES.ROOM_FULL };
    const team = this.pickTeam();
    if (this.members.size >= MAX_PLAYERS) this.evictBot(team);
    const member = {
      id: `p${this.nextId++}`, name, team, ready: false, isBot: false, client, connected: true,
      token: this.makeToken(), graceTicks: 0,
    };
    this.members.set(member.id, member);
    if (!this.host) this.host = member.id;
    if (this.sim) this.sim.addPlayer({ id: member.id, name, team, isBot: false });
    this.sendTo(member, this.welcome(member));
    this.broadcastLobby();
    return { ok: true, member };
  }

  welcome(member) {
    return {
      t: S2C.WELCOME, id: member.id, room: this.code, token: member.token, team: member.team,
      host: member.id === this.host, state: this.state,
    };
  }

  reconnect(member, client) {
    member.client = client;
    member.connected = true;
    member.graceTicks = 0;
    if (this.sim && this.sim.players.has(member.id)) this.sim.setBotControl(member.id, false);
    this.sendTo(member, this.welcome(member));
    this.broadcastLobby();
    return { ok: true, member };
  }

  /** The socket closed. In a running match the slot is held for a while and played by a bot. */
  disconnect(id) {
    const m = this.members.get(id);
    if (!m || m.isBot) return;
    m.connected = false;
    m.client = null;
    if (this.state === STATE_PLAYING && this.sim) {
      m.graceTicks = RECONNECT_GRACE_TICKS;
      this.sim.setBotControl(id, true, this.difficulty);
      this.broadcastLobby();
    } else {
      this.leave(id);
    }
  }

  /** The player is gone for good: migrate the host and let a bot take over the slot. */
  leave(id) {
    const m = this.members.get(id);
    if (!m || m.isBot) return;
    const wasHost = this.host === id;
    if (this.state === STATE_PLAYING && this.sim && this.sim.players.has(id)) {
      // Keep the id so the running simulation entity continues as a bot.
      m.name = BOT_NAMES[this.nextBot++ % BOT_NAMES.length];
      m.isBot = true;
      m.client = null;
      m.connected = true;
      m.ready = true;
      m.token = '';
      m.graceTicks = 0;
      this.sim.players.get(id).name = m.name;
      this.sim.setBotControl(id, true, this.difficulty);
    } else {
      this.deleteMember(id);
    }
    if (wasHost) this.host = this.nextHost();
    if (this.humans().length === 0) {
      this.onEmpty(this);
      return;
    }
    this.broadcastLobby();
  }

  nextHost() {
    const next = this.connectedHumans()[0] ?? this.humans()[0];
    return next ? next.id : null;
  }

  // ---- host controls ---------------------------------------------------------------------

  isHost(id) {
    return this.host === id;
  }

  hostAction(id, msg) {
    const m = this.members.get(id);
    if (!m) return;
    if (!this.isHost(id)) { this.sendError(m, ERROR_CODES.NOT_HOST); return; }
    switch (msg.action) {
      case 'addBot': this.addBot(m, msg.team); break;
      case 'removeBot': this.removeBot(m, msg.id); break;
      case 'difficulty': this.setDifficulty(msg.value); break;
      case 'kick': this.kick(m, msg.id); break;
      case 'start': this.start(m); break;
      default: break;
    }
  }

  addBot(requester, team) {
    if (this.members.size >= MAX_PLAYERS) { this.sendError(requester, ERROR_CODES.ROOM_FULL); return null; }
    const t = team === TEAM_CT || team === TEAM_T ? team : this.pickTeam();
    if (this.teamMembers(t).length >= TEAM_SIZE) { this.sendError(requester, ERROR_CODES.ROOM_FULL); return null; }
    const id = `b${++this.nextBot}`;
    const name = BOT_NAMES[this.nextBot % BOT_NAMES.length];
    const member = { id, name, team: t, ready: true, isBot: true, client: null, connected: true, token: '', graceTicks: 0 };
    this.members.set(id, member);
    if (this.sim) this.sim.addPlayer({ id, name, team: t, isBot: true, difficulty: this.difficulty });
    this.broadcastLobby();
    return member;
  }

  removeBot(requester, id) {
    const bot = id ? this.members.get(id) : this.bots().pop();
    if (!bot || !bot.isBot) return false;
    this.deleteMember(bot.id);
    this.broadcastLobby();
    return true;
  }

  setDifficulty(value) {
    this.difficulty = value;
    if (this.sim) this.sim.setDifficulty(value);
    this.broadcastLobby();
  }

  kick(requester, id) {
    const target = this.members.get(id);
    if (!target || target.isBot || target.id === requester.id) return false;
    this.sendError(target, ERROR_CODES.KICKED);
    this.banned.add(target.token);
    const client = target.client;
    this.leave(target.id);
    if (client && client.close) client.close();
    return true;
  }

  setReady(id, ready) {
    const m = this.members.get(id);
    if (!m || m.isBot || this.state !== STATE_LOBBY) return;
    m.ready = ready;
    this.broadcastLobby();
  }

  allReady() {
    return this.humans().every((m) => m.id === this.host || m.ready);
  }

  /** Starts the match and fills both teams with bots. */
  start(requester) {
    if (this.state !== STATE_LOBBY) { this.sendError(requester, ERROR_CODES.BAD_STATE); return false; }
    if (!this.allReady()) { this.sendError(requester, ERROR_CODES.NOT_READY); return false; }
    for (const team of [TEAM_CT, TEAM_T]) {
      while (this.teamMembers(team).length < TEAM_SIZE) {
        if (!this.addBot(requester, team)) return false;
      }
    }
    this.sim = new GameSim({ seed: this.seed, difficulty: this.difficulty });
    for (const m of this.members.values()) {
      this.sim.addPlayer({ id: m.id, name: m.name, team: m.team, isBot: m.isBot, difficulty: this.difficulty });
      if (!m.isBot && !m.connected) this.sim.setBotControl(m.id, true, this.difficulty);
    }
    this.state = STATE_PLAYING;
    this.endTicks = 0;
    this.broadcastLobby();
    return true;
  }

  // ---- gameplay messages -----------------------------------------------------------------

  chat(id, text) {
    const m = this.members.get(id);
    if (!m) return;
    const clean = sanitizeChat(text);
    if (!clean) return;
    this.broadcast({ t: S2C.CHAT, from: m.name, id: m.id, team: m.team, text: clean });
  }

  input(id, value) {
    if (this.state !== STATE_PLAYING || !this.sim) return;
    this.sim.applyInput(id, value);
  }

  buy(id, item) {
    if (this.state !== STATE_PLAYING || !this.sim) return;
    const res = this.sim.buy(id, item);
    const m = this.members.get(id);
    if (!res.ok && m) this.sendTo(m, { t: S2C.EVENT, kind: 'buy', ok: false, code: res.code, text: res.reason, item });
  }

  // ---- tick ------------------------------------------------------------------------------

  tick() {
    this.tickCount += 1;
    if (this.state !== STATE_PLAYING || !this.sim) return;
    for (const m of [...this.members.values()]) {
      if (!m.isBot && !m.connected && m.graceTicks > 0) {
        m.graceTicks -= 1;
        if (m.graceTicks === 0) this.leave(m.id);
      }
    }
    if (!this.sim) return;
    const events = this.sim.tick();
    const matchEnded = events.some((e) => e.type === 'match_end');
    this.broadcast(this.sim.snapshot());
    for (const e of events) {
      const kind = EVENT_KIND[e.type];
      if (kind) this.broadcast({ t: S2C.EVENT, kind, ...e });
    }
    if (matchEnded) this.endTicks = MATCH_END_TICKS;
    if (this.endTicks > 0) {
      this.endTicks -= 1;
      if (this.endTicks === 0) this.returnToLobby();
    }
  }

  returnToLobby() {
    this.sim = null;
    this.state = STATE_LOBBY;
    for (const m of [...this.members.values()]) {
      if (m.isBot) this.members.delete(m.id);
      else m.ready = false;
    }
    for (const m of [...this.members.values()]) {
      if (!m.isBot && !m.connected) this.members.delete(m.id);
    }
    if (!this.members.has(this.host)) this.host = this.nextHost();
    if (this.humans().length === 0) { this.onEmpty(this); return; }
    this.broadcastLobby();
  }
}
