// Authoritative game simulation shared by the server and the browser solo mode.
// DOM-free and deterministic: all randomness comes from a seeded generator.
//
// Input convention: mz > 0 moves forward, mx > 0 strafes right, yaw 0 looks toward -z.
import {
  JUMP_SPEED, MAX_HEALTH, RUN_SPEED, TEAM_CT, TEAM_T, TICK_DT,
  WALK_SPEED, DEFUSE_RANGE,
} from './constants.js';
import { MAP, siteAt, spawnsFor } from './map.js';
import {
  createBody, directionFromAngles, eyePosition, hasLineOfSight, movePlayer, raycast, rayPlayer,
} from './collision.js';
import { getWeapon, isAllowedForTeam, recoilAt, spreadFor, startingSecondary, CATEGORY_GRENADE, CATEGORY_KNIFE } from './weapons.js';
import { PLANT_BONUS, DEFUSE_BONUS, addMoney, createInventory, killReward, purchase, resetLoadout } from './economy.js';
import {
  PHASE_ENDED, PHASE_FREEZE, PHASE_LIVE, PHASE_MATCH_END, canMove, createMatch, isBuyPhase, requestDefuse,
  requestPlant, stopDefuse, stopPlant, updateRound,
} from './round.js';
import { BOMB_IDLE, BOMB_PLANTED, BOMB_PLANTING } from './bomb.js';
import { classifyHitgroup, computeDamage, computeSplash, flashDuration, applyDamage } from './damage.js';
import { GRENADE_GRAVITY, createBrain, thinkBot, chooseBuys, assignRoles } from './bots.js';

export const MAX_INPUT_QUEUE = 6;
export const PICKUP_RANGE = 2;
export const SMOKE_RADIUS = 4;
const RECOIL_RECOVERY = 0.35;
const PUNCH_DECAY = 9;
const STEP_SOUND_INTERVAL = 0.38;
const SHOT_SOUND_RADIUS = 55;
const STEP_SOUND_RADIUS = 28;
const DEG = Math.PI / 180;
const MAX_ENGAGE = 200;

/** Small fast seeded generator (mulberry32). */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SLOT_TO_WEAPON = (p, slot) => {
  if (slot === 'primary') return p.inv.primary;
  if (slot === 'secondary') return p.inv.secondary;
  if (slot === 'knife') return 'knife';
  if (slot === 'smoke' || slot === 'flash' || slot === 'he') return p.inv.grenades[slot] > 0 ? slot : null;
  return null;
};

const EMPTY_INPUT = Object.freeze({
  seq: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, fire: false, reload: false, walk: false,
  use: false, scope: false, slot: null, throw: null,
});

export class GameSim {
  /**
   * @param {{seed?:number, map?:object, difficulty?:string}} options
   */
  constructor({ seed = 1, map = MAP, difficulty = 'orta' } = {}) {
    this.map = map;
    this.rng = createRng(seed);
    this.difficulty = difficulty;
    this.players = new Map();
    this.match = createMatch();
    this.tickCount = 0;
    this.time = 0;
    this.drops = [];
    this.grenades = [];
    this.smokes = [];
    this.sounds = [];
    this.bombPos = null;
    this.bombCarrier = null;
    this.droppedBomb = null;
    this.nextEntityId = 1;
    this.pendingEvents = [];
    this.roundStarted = false;
  }

  // ---- roster ----------------------------------------------------------------------------

  /** Adds a player or bot. Joining mid-round means waiting dead until the next round. */
  addPlayer({ id, name, team, isBot = false, difficulty = this.difficulty }) {
    if (this.players.has(id)) throw new Error(`duplicate player ${id}`);
    const p = {
      id, name, team, isBot, difficulty,
      alive: false, health: MAX_HEALTH, armor: 0, inv: createInventory(team),
      body: createBody(0, 0, 0), yaw: 0, pitch: 0, punch: [0, 0],
      ammo: {}, cur: null, fireTimer: 0, reloadTimer: 0, drawTimer: 0, shots: 0, sinceShot: 9,
      prevFire: false, prevUse: false, prevReload: false, scoped: false, flash: 0,
      kills: 0, deaths: 0, queue: [], lastInput: EMPTY_INPUT, lastSeq: 0, stepTimer: 0,
      moving: false, spawnIndex: 0, brain: null,
    };
    this.players.set(id, p);
    this.giveStartingAmmo(p);
    p.cur = p.inv.secondary;
    if (isBot) p.brain = createBrain(this, p, difficulty);
    if (this.match.phase === PHASE_FREEZE) this.spawn(p);
    this.recomputeSpawnIndexes();
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return false;
    if (p.alive) this.dropLoot(p);
    if (this.bombCarrier === id) this.bombCarrier = null;
    if (this.match.bomb.planter === id && this.match.bomb.state === BOMB_PLANTING) stopPlant(this.match);
    if (this.match.bomb.defuser === id) stopDefuse(this.match);
    this.players.delete(id);
    return true;
  }

  /** Switches a player between human and bot control, keeping all state. */
  setBotControl(id, isBot, difficulty = this.difficulty) {
    const p = this.players.get(id);
    if (!p) return false;
    p.isBot = isBot;
    p.queue.length = 0;
    p.brain = isBot ? createBrain(this, p, difficulty) : null;
    if (isBot) p.difficulty = difficulty;
    return true;
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    for (const p of this.players.values()) {
      if (p.isBot) { p.difficulty = difficulty; p.brain = createBrain(this, p, difficulty); }
    }
  }

  teamPlayers(team) {
    return [...this.players.values()].filter((p) => p.team === team);
  }

  aliveCount(team) {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team && p.alive) n++;
    return n;
  }

  recomputeSpawnIndexes() {
    for (const team of [TEAM_CT, TEAM_T]) {
      this.teamPlayers(team).forEach((p, i) => { p.spawnIndex = i; });
    }
  }

  giveStartingAmmo(p) {
    for (const id of [p.inv.primary, p.inv.secondary]) {
      if (id && !p.ammo[id]) {
        const w = getWeapon(id);
        p.ammo[id] = { mag: w.mag, reserve: w.reserve };
      }
    }
  }

  // ---- input -----------------------------------------------------------------------------

  /** Queues one validated input command from a human player. */
  applyInput(id, input) {
    const p = this.players.get(id);
    if (!p || p.isBot) return false;
    p.queue.push(input);
    while (p.queue.length > MAX_INPUT_QUEUE) p.queue.shift();
    return true;
  }

  /** Buys an item for a player. Returns the economy result. */
  buy(id, itemId) {
    const p = this.players.get(id);
    if (!p || !p.alive) return { ok: false, code: 'dead', reason: 'O\'lik o\'yinchi xarid qila olmaydi' };
    const res = purchase(p.inv, itemId, isBuyPhase(this.match));
    if (!res.ok) return res;
    const w = getWeapon(itemId);
    if (w.slot === 'primary' || w.slot === 'secondary') {
      const prev = p.inv[w.slot];
      p.ammo[itemId] = { mag: w.mag, reserve: w.reserve };
      if (prev && prev !== itemId) delete p.ammo[prev];
      this.selectWeapon(p, itemId);
    }
    if (w.slot === 'armor') p.armor = w.armorValue;
    this.pendingEvents.push({ type: 'buy', player: id, item: itemId });
    return res;
  }

  selectWeapon(p, weaponId) {
    if (!weaponId || p.cur === weaponId) return;
    p.cur = weaponId;
    p.reloadTimer = 0;
    p.drawTimer = getWeapon(weaponId).drawTime;
    p.shots = 0;
    p.scoped = false;
  }

  // ---- spawning and rounds ---------------------------------------------------------------

  spawn(p) {
    const list = spawnsFor(this.map, p.team);
    const s = list[p.spawnIndex % list.length];
    p.body = createBody(s.x, s.y, s.z);
    p.yaw = s.yaw;
    p.pitch = 0;
    p.punch = [0, 0];
    p.health = MAX_HEALTH;
    p.alive = true;
    p.flash = 0;
    p.fireTimer = 0;
    p.reloadTimer = 0;
    p.shots = 0;
    p.queue.length = 0;
    p.lastInput = EMPTY_INPUT;
    if (!p.inv.secondary) p.inv.secondary = startingSecondary(p.team);
    this.giveStartingAmmo(p);
    p.cur = p.inv.primary || p.inv.secondary;
    p.drawTimer = 0;
    if (p.brain) p.brain = createBrain(this, p, p.difficulty);
  }

  /** Called when a new round enters its buy phase: respawn and reset volatile state. */
  startRoundSetup(swapped) {
    this.drops = [];
    this.grenades = [];
    this.smokes = [];
    this.bombPos = null;
    this.droppedBomb = null;
    this.bombCarrier = null;
    for (const p of this.players.values()) {
      if (swapped) {
        p.team = p.team === TEAM_CT ? TEAM_T : TEAM_CT;
        p.inv = createInventory(p.team);
        p.ammo = {};
        p.armor = 0;
      } else if (!p.alive) {
        resetLoadout(p.inv);
        p.ammo = {};
        p.armor = 0;
      }
    }
    this.recomputeSpawnIndexes();
    for (const p of this.players.values()) this.spawn(p);
    const ts = this.teamPlayers(TEAM_T);
    if (ts.length > 0) {
      const carrier = ts[Math.floor(this.rng() * ts.length)];
      this.bombCarrier = carrier.id;
    }
    assignRoles(this);
    for (const p of this.players.values()) {
      if (p.isBot) for (const item of chooseBuys(this, p)) this.buy(p.id, item);
    }
    this.roundStarted = true;
  }

  // ---- main tick -------------------------------------------------------------------------

  /** Advances the simulation by one fixed step and returns the events that happened. */
  tick() {
    const dt = TICK_DT;
    this.tickCount += 1;
    this.time += dt;
    this.sounds = [];
    const events = this.pendingEvents;
    this.pendingEvents = [];
    if (!this.roundStarted) this.startRoundSetup(false);

    const moveAllowed = canMove(this.match);
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const input = this.nextInput(p, dt);
      this.stepPlayer(p, input, dt, moveAllowed, events);
    }
    this.updateBombActions(events);
    this.updateGrenades(dt, events);
    this.updateSmokes(dt);
    this.updateDroppedBomb();

    const alive = { CT: this.aliveCount(TEAM_CT), T: this.aliveCount(TEAM_T) };
    const roundEvents = updateRound(this.match, dt, alive);
    let swapped = false;
    let newRound = false;
    for (const e of roundEvents) {
      events.push(e);
      if (e.type === 'planted') this.onPlanted(e);
      if (e.type === 'round_end') this.onRoundEnd(e);
      if (e.type === 'sides_swapped') swapped = true;
      if (e.type === 'round_start') newRound = true;
    }
    if (newRound) this.startRoundSetup(swapped);
    return events;
  }

  nextInput(p, dt) {
    if (p.isBot) {
      const cmd = thinkBot(this, p, dt);
      p.lastSeq += 1;
      return cmd;
    }
    let input = p.queue.shift();
    if (!input) {
      // Repeat the held movement but never repeat one-shot actions.
      input = { ...p.lastInput, jump: false, reload: false, slot: null, throw: null };
    } else {
      p.lastSeq = input.seq;
    }
    p.lastInput = input;
    return input;
  }

  stepPlayer(p, input, dt, moveAllowed, events) {
    p.yaw = input.yaw;
    p.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, input.pitch));
    p.sinceShot += dt;
    if (p.sinceShot > RECOIL_RECOVERY) p.shots = 0;
    const decay = Math.exp(-PUNCH_DECAY * dt);
    p.punch[0] *= decay;
    p.punch[1] *= decay;
    p.fireTimer = Math.max(0, p.fireTimer - dt);
    p.drawTimer = Math.max(0, p.drawTimer - dt);
    p.flash = Math.max(0, p.flash - dt);

    if (input.slot) {
      const wid = SLOT_TO_WEAPON(p, input.slot);
      if (wid && input.slot !== 'smoke' && input.slot !== 'flash' && input.slot !== 'he') this.selectWeapon(p, wid);
    }
    const weapon = getWeapon(p.cur);
    p.scoped = !!(input.scope && weapon.zoom);

    // Movement: speed is derived from the server side tables, never from the client.
    let mx = Number.isFinite(input.mx) ? input.mx : 0;
    let mz = Number.isFinite(input.mz) ? input.mz : 0;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    let speed = (input.walk ? WALK_SPEED : RUN_SPEED) * weapon.moveSpeed;
    if (p.scoped) speed *= weapon.zoom.moveSpeed;
    let dx = 0;
    let dz = 0;
    const planting = this.match.bomb.state === BOMB_PLANTING && this.match.bomb.planter === p.id;
    const defusing = this.match.bomb.defuser === p.id;
    if (moveAllowed && !planting && !defusing) {
      const sin = Math.sin(p.yaw);
      const cos = Math.cos(p.yaw);
      dx = (-sin * mz + cos * mx) * speed * dt;
      dz = (-cos * mz - sin * mx) * speed * dt;
    }
    const jump = moveAllowed && input.jump ? JUMP_SPEED : 0;
    movePlayer(this.map, p.body, dx, dz, dt, jump);
    p.moving = dx !== 0 || dz !== 0;
    if (p.moving && !input.walk && p.body.onGround) {
      p.stepTimer -= dt;
      if (p.stepTimer <= 0) {
        p.stepTimer = STEP_SOUND_INTERVAL;
        this.sounds.push({ kind: 'step', x: p.body.x, z: p.body.z, team: p.team, id: p.id, radius: STEP_SOUND_RADIUS });
      }
    }

    // Reload.
    if (p.reloadTimer > 0) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) this.finishReload(p);
    } else if (input.reload && !p.prevReload) {
      this.startReload(p);
    }
    p.prevReload = input.reload;

    if (input.throw && moveAllowed) this.throwGrenade(p, input.throw);
    if (input.use && !p.prevUse) this.tryPickup(p);
    p.prevUse = input.use;

    if (input.fire && moveAllowed && weapon.category !== CATEGORY_GRENADE) this.tryFire(p, weapon, events);
    p.prevFire = input.fire;
    p.wantsUse = input.use;
    p.wantsWalk = input.walk;
  }

  // ---- weapons ---------------------------------------------------------------------------

  startReload(p) {
    const w = getWeapon(p.cur);
    const a = p.ammo[p.cur];
    if (!a || w.mag === 0 || a.mag >= w.mag || a.reserve <= 0 || p.reloadTimer > 0) return false;
    p.reloadTimer = w.reload;
    return true;
  }

  finishReload(p) {
    const w = getWeapon(p.cur);
    const a = p.ammo[p.cur];
    if (!a) return;
    const need = w.mag - a.mag;
    const take = Math.min(need, a.reserve);
    a.mag += take;
    a.reserve -= take;
  }

  movementState(p) {
    if (!p.body.onGround) return 'air';
    if (!p.moving) return 'stand';
    return p.wantsWalk ? 'walk' : 'move';
  }

  tryFire(p, weapon, events) {
    if (p.fireTimer > 0 || p.drawTimer > 0 || p.reloadTimer > 0) return;
    if (!weapon.auto && p.prevFire) return;
    const origin = eyePosition(p.body);
    if (weapon.category === CATEGORY_KNIFE) {
      p.fireTimer = 1 / weapon.fireRate;
      const dir = directionFromAngles(p.yaw, p.pitch);
      this.resolveShot(p, weapon, origin, dir, weapon.range, events);
      return;
    }
    const a = p.ammo[p.cur];
    if (!a || a.mag <= 0) {
      this.startReload(p);
      return;
    }
    a.mag -= 1;
    p.fireTimer = 1 / weapon.fireRate;
    const kick = recoilAt(p.cur, p.shots);
    p.shots += 1;
    p.sinceShot = 0;
    p.punch[0] += kick[0] * DEG;
    p.punch[1] += kick[1] * DEG;
    const spread = spreadFor(p.cur, this.movementState(p), p.scoped);
    const ang = this.rng() * Math.PI * 2;
    const mag = Math.sqrt(this.rng()) * spread;
    const dir = directionFromAngles(p.yaw + p.punch[1] + Math.cos(ang) * mag, p.pitch + p.punch[0] + Math.sin(ang) * mag);
    this.sounds.push({ kind: 'shot', x: p.body.x, z: p.body.z, team: p.team, id: p.id, radius: SHOT_SOUND_RADIUS });
    events.push({ type: 'shot', player: p.id, weapon: p.cur, x: origin[0], y: origin[1], z: origin[2] });
    this.resolveShot(p, weapon, origin, dir, MAX_ENGAGE, events);
  }

  resolveShot(shooter, weapon, origin, dir, range, events) {
    const wall = raycast(this.map, origin, dir, range);
    const maxDist = wall ? wall.distance : range;
    let best = null;
    for (const t of this.players.values()) {
      if (!t.alive || t.team === shooter.team || t === shooter) continue;
      const hit = rayPlayer(origin, dir, t.body, maxDist);
      if (hit && (best === null || hit.distance < best.hit.distance)) best = { target: t, hit };
    }
    if (!best) return;
    const group = classifyHitgroup(best.hit.hitY, best.target.body.y);
    const result = computeDamage({ weaponId: weapon.id, hitgroup: group, distance: best.hit.distance, armor: best.target.armor });
    events.push({ type: 'hit', attacker: shooter.id, victim: best.target.id, damage: result.damage, headshot: result.headshot });
    this.damagePlayer(shooter, best.target, result, weapon.id, events);
  }

  damagePlayer(attacker, victim, result, weaponId, events) {
    const killed = applyDamage(victim, result);
    if (victim.brain) victim.brain.hurtBy = attacker ? attacker.id : null;
    if (!killed) return;
    victim.deaths += 1;
    if (attacker && attacker !== victim) {
      attacker.kills += 1;
      attacker.inv.money = addMoney(attacker.inv.money, killReward(weaponId));
    }
    events.push({
      type: 'kill', killer: attacker ? attacker.id : null, victim: victim.id, weapon: weaponId, headshot: result.headshot,
    });
    this.killPlayer(victim);
  }

  killPlayer(p) {
    p.alive = false;
    p.health = 0;
    this.dropLoot(p);
    if (this.match.bomb.planter === p.id && this.match.bomb.state === BOMB_PLANTING) stopPlant(this.match);
    if (this.match.bomb.defuser === p.id) stopDefuse(this.match);
    if (this.bombCarrier === p.id) {
      this.bombCarrier = null;
      this.droppedBomb = { x: p.body.x, y: p.body.y, z: p.body.z };
    }
  }

  dropLoot(p) {
    const id = p.inv.primary || (p.inv.secondary !== (p.team === TEAM_CT ? 'usp_s' : 'glock18') ? p.inv.secondary : null);
    if (!id) return;
    const a = p.ammo[id] ?? { mag: getWeapon(id).mag, reserve: 0 };
    this.drops.push({
      id: `d${this.nextEntityId++}`, weapon: id, x: p.body.x, y: p.body.y, z: p.body.z, mag: a.mag, reserve: a.reserve,
    });
    const slot = getWeapon(id).slot;
    p.inv[slot] = null;
  }

  tryPickup(p) {
    let best = null;
    let bestD = PICKUP_RANGE;
    for (const d of this.drops) {
      const dist = Math.hypot(d.x - p.body.x, d.z - p.body.z);
      if (dist < bestD && Math.abs(d.y - p.body.y) < 2 && isAllowedForTeam(d.weapon, p.team)) { best = d; bestD = dist; }
    }
    if (!best) return false;
    const w = getWeapon(best.weapon);
    const old = p.inv[w.slot];
    this.drops.splice(this.drops.indexOf(best), 1);
    if (old) {
      const a = p.ammo[old] ?? { mag: 0, reserve: 0 };
      this.drops.push({
        id: `d${this.nextEntityId++}`, weapon: old, x: p.body.x, y: p.body.y, z: p.body.z, mag: a.mag, reserve: a.reserve,
      });
      delete p.ammo[old];
    }
    p.inv[w.slot] = best.weapon;
    p.ammo[best.weapon] = { mag: best.mag, reserve: best.reserve };
    this.selectWeapon(p, best.weapon);
    this.pendingEvents.push({ type: 'pickup', player: p.id, weapon: best.weapon });
    return true;
  }

  // ---- grenades --------------------------------------------------------------------------

  throwGrenade(p, type) {
    if (!p.inv.grenades[type] || p.inv.grenades[type] <= 0) return false;
    const w = getWeapon(type);
    p.inv.grenades[type] -= 1;
    const dir = directionFromAngles(p.yaw, p.pitch);
    const eye = eyePosition(p.body);
    this.grenades.push({
      id: `g${this.nextEntityId++}`, type, owner: p.id, team: p.team,
      pos: [eye[0] + dir[0] * 0.5, eye[1] + dir[1] * 0.5, eye[2] + dir[2] * 0.5],
      vel: [dir[0] * w.throwSpeed, dir[1] * w.throwSpeed, dir[2] * w.throwSpeed],
      fuse: w.fuse,
    });
    return true;
  }

  updateGrenades(dt, events) {
    for (const g of [...this.grenades]) {
      g.fuse -= dt;
      g.vel[1] -= GRENADE_GRAVITY * dt;
      for (let axis = 0; axis < 3; axis++) {
        const d = g.vel[axis] * dt;
        if (d === 0) continue;
        const dir = [0, 0, 0];
        dir[axis] = Math.sign(d);
        const hit = raycast(this.map, g.pos, dir, Math.abs(d) + 0.1);
        if (hit) {
          g.vel[axis] *= -0.4;
          for (let o = 0; o < 3; o++) if (o !== axis) g.vel[o] *= 0.85;
        } else {
          g.pos[axis] += d;
        }
      }
      if (g.pos[1] < 0.1) {
        g.pos[1] = 0.1;
        g.vel[1] = Math.abs(g.vel[1]) * 0.35;
        g.vel[0] *= 0.7;
        g.vel[2] *= 0.7;
      }
      if (g.fuse <= 0) {
        this.grenades.splice(this.grenades.indexOf(g), 1);
        this.detonate(g, events);
      }
    }
  }

  detonate(g, events) {
    const w = getWeapon(g.type);
    const owner = this.players.get(g.owner) ?? null;
    events.push({ type: 'grenade', kind: g.type, x: g.pos[0], y: g.pos[1], z: g.pos[2] });
    if (g.type === 'smoke') {
      this.smokes.push({ x: g.pos[0], y: g.pos[1], z: g.pos[2], radius: SMOKE_RADIUS, time: w.effectDuration });
      return;
    }
    for (const p of [...this.players.values()]) {
      if (!p.alive) continue;
      const eye = eyePosition(p.body);
      const dist = Math.hypot(eye[0] - g.pos[0], eye[1] - g.pos[1], eye[2] - g.pos[2]);
      if (dist >= w.radius) continue;
      const chest = [p.body.x, p.body.y + 1, p.body.z];
      if (!hasLineOfSight(this.map, g.pos, chest) && !hasLineOfSight(this.map, g.pos, eye)) continue;
      if (g.type === 'he') {
        if (p.team === g.team && p !== owner) continue;
        const res = computeSplash({ weaponId: 'he', distance: dist, armor: p.armor });
        if (res.damage > 0) this.damagePlayer(p === owner ? null : owner, p, res, 'he', events);
      } else if (g.type === 'flash') {
        const to = [g.pos[0] - eye[0], g.pos[1] - eye[1], g.pos[2] - eye[2]];
        const tl = Math.hypot(to[0], to[1], to[2]) || 1;
        const look = directionFromAngles(p.yaw, p.pitch);
        const dot = (to[0] * look[0] + to[1] * look[1] + to[2] * look[2]) / tl;
        p.flash = Math.max(p.flash, flashDuration(dist, dot));
      }
    }
  }

  updateSmokes(dt) {
    for (const s of this.smokes) s.time -= dt;
    this.smokes = this.smokes.filter((s) => s.time > 0);
  }

  /** True when a smoke cloud blocks the straight line between two points. */
  smokeBlocks(from, to) {
    for (const s of this.smokes) {
      const dx = to[0] - from[0];
      const dz = to[2] - from[2];
      const len2 = dx * dx + dz * dz;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((s.x - from[0]) * dx + (s.z - from[2]) * dz) / len2));
      const px = from[0] + dx * t;
      const pz = from[2] + dz * t;
      if (Math.hypot(px - s.x, pz - s.z) < s.radius) return true;
    }
    return false;
  }

  // ---- bomb ------------------------------------------------------------------------------

  updateDroppedBomb() {
    if (!this.droppedBomb) return;
    for (const p of this.players.values()) {
      if (p.alive && p.team === TEAM_T && Math.hypot(p.body.x - this.droppedBomb.x, p.body.z - this.droppedBomb.z) < 1.5) {
        this.bombCarrier = p.id;
        this.droppedBomb = null;
        return;
      }
    }
  }

  updateBombActions(events) {
    const m = this.match;
    if (m.phase !== PHASE_LIVE) return;
    const bomb = m.bomb;
    if (bomb.state === BOMB_PLANTING) {
      const planter = this.players.get(bomb.planter);
      if (!planter || !planter.alive || !planter.wantsUse || !planter.body.onGround) {
        stopPlant(m);
      }
    } else if (bomb.state === BOMB_IDLE && this.bombCarrier) {
      const c = this.players.get(this.bombCarrier);
      if (c && c.alive && c.wantsUse) {
        const site = siteAt(this.map, c.body.x, c.body.z);
        if (site && c.body.y < 1 && c.body.onGround && requestPlant(m, c.id, site.id)) {
          this.bombPos = { x: c.body.x, y: c.body.y, z: c.body.z };
          events.push({ type: 'planting', player: c.id, site: site.id });
        }
      }
    }
    if (bomb.state === BOMB_PLANTED && this.bombPos) {
      if (bomb.defuser !== null) {
        const d = this.players.get(bomb.defuser);
        const near = d && d.alive && d.wantsUse
          && Math.hypot(d.body.x - this.bombPos.x, d.body.z - this.bombPos.z) <= DEFUSE_RANGE;
        if (!near) stopDefuse(m);
      }
      if (bomb.defuser === null) {
        for (const p of this.players.values()) {
          if (p.alive && p.team === TEAM_CT && p.wantsUse
            && Math.hypot(p.body.x - this.bombPos.x, p.body.z - this.bombPos.z) <= DEFUSE_RANGE
            && requestDefuse(m, p.id, p.inv.hasKit)) {
            events.push({ type: 'defusing', player: p.id });
            break;
          }
        }
      }
    }
  }

  onPlanted(e) {
    this.bombCarrier = null;
    this.bombPos = this.bombPos ?? { x: 0, y: 0, z: 0 };
    const planter = this.players.get(e.planter);
    if (planter) planter.inv.money = addMoney(planter.inv.money, PLANT_BONUS);
  }

  onRoundEnd(e) {
    for (const p of this.players.values()) {
      p.inv.money = addMoney(p.inv.money, e.rewards[p.team] ?? 0);
    }
    if (e.reason === 'defused') {
      const d = this.players.get(this.match.bomb.defuser);
      if (d) d.inv.money = addMoney(d.inv.money, DEFUSE_BONUS);
    }
    for (const p of this.players.values()) p.wantsUse = false;
  }

  // ---- snapshot --------------------------------------------------------------------------

  isLive() {
    return this.match.phase === PHASE_LIVE;
  }

  isOver() {
    return this.match.phase === PHASE_MATCH_END;
  }

  isRoundEnded() {
    return this.match.phase === PHASE_ENDED;
  }

  /** Compact state sent to clients every tick. */
  snapshot() {
    const m = this.match;
    const r = (v) => Math.round(v * 100) / 100;
    return {
      t: 'snapshot',
      tick: this.tickCount,
      phase: m.phase,
      round: m.round,
      timer: r(m.timer),
      score: { CT: m.score.CT, T: m.score.T },
      result: m.result ? { winner: m.result.winner, reason: m.result.reason } : null,
      matchWinner: m.winner,
      bomb: {
        state: m.bomb.state, site: m.bomb.site, timer: r(m.bomb.timer),
        plant: r(m.bomb.plantProgress), defuse: r(m.bomb.defuseProgress), defuseNeeded: m.bomb.defuseNeeded,
        pos: this.bombPos && m.bomb.state !== BOMB_IDLE ? [r(this.bombPos.x), r(this.bombPos.z)] : null,
        dropped: this.droppedBomb ? [r(this.droppedBomb.x), r(this.droppedBomb.z)] : null,
      },
      players: [...this.players.values()].map((p) => {
        const a = p.ammo[p.cur];
        return {
          id: p.id, name: p.name, team: p.team, bot: p.isBot, alive: p.alive,
          x: r(p.body.x), y: r(p.body.y), z: r(p.body.z), vy: r(p.body.vy), ground: p.body.onGround,
          yaw: r(p.yaw), pitch: r(p.pitch), health: p.health, armor: p.armor, money: p.inv.money,
          weapon: p.cur, mag: a ? a.mag : 0, reserve: a ? a.reserve : 0, reloading: p.reloadTimer > 0,
          primary: p.inv.primary, secondary: p.inv.secondary, grenades: { ...p.inv.grenades },
          kit: p.inv.hasKit, bombCarrier: this.bombCarrier === p.id, flash: r(p.flash),
          kills: p.kills, deaths: p.deaths, seq: p.lastSeq, scoped: p.scoped,
          state: p.brain ? p.brain.state : null,
        };
      }),
      drops: this.drops.map((d) => ({ id: d.id, weapon: d.weapon, x: r(d.x), y: r(d.y), z: r(d.z) })),
      grenades: this.grenades.map((g) => ({ id: g.id, type: g.type, pos: g.pos.map(r) })),
      smokes: this.smokes.map((s) => ({ x: r(s.x), y: r(s.y), z: r(s.z), radius: s.radius, time: r(s.time) })),
    };
  }
}
