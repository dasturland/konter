// Bot brain: perception (view cone, raycast line of sight, hearing), a finite state machine
// and waypoint navigation with A*. A bot produces the same input command a human sends.
import { PLAYER_EYE_HEIGHT, TEAM_CT, TEAM_T } from './constants.js';
import { directionFromAngles, eyePosition, hasLineOfSight } from './collision.js';
import { SITES } from './map.js';
import { WAYPOINTS, findPath, nearestWaypoint } from './waypoints.js';
import { getWeapon, CATEGORY_SNIPER, buyList } from './weapons.js';
import { BOMB_PLANTED, BOMB_PLANTING } from './bomb.js';

export const GRENADE_GRAVITY = 14;

export const BOT_STATES = Object.freeze({
  PATROL: 'patrol',
  ATTACK: 'attack',
  RETREAT: 'retreat',
  PLANT: 'plant',
  DEFEND: 'defend',
  DEFUSE: 'defuse',
});

/** Uzbek labels for the debug overlay and the lobby. */
export const BOT_STATE_LABELS_UZ = Object.freeze({
  patrol: 'Patrul',
  attack: 'Hujum',
  retreat: 'Chekinish',
  plant: 'Bomba qo\'yish',
  defend: 'Himoya',
  defuse: 'Zararsizlantirish',
});

export const DIFFICULTIES = Object.freeze({
  oson: {
    id: 'oson', label: 'Oson', reaction: 0.85, turnSpeed: 3.2, aimError: 0.11, hearing: 0.5, viewRange: 55,
    halfFov: 0.96, memory: 2, burstLen: [0.12, 0.3], burstPause: [0.3, 0.6], headChance: 0.05,
  },
  orta: {
    id: 'orta', label: 'O\'rta', reaction: 0.5, turnSpeed: 6, aimError: 0.05, hearing: 0.8, viewRange: 75,
    halfFov: 0.96, memory: 3, burstLen: [0.2, 0.45], burstPause: [0.2, 0.45], headChance: 0.15,
  },
  qiyin: {
    id: 'qiyin', label: 'Qiyin', reaction: 0.22, turnSpeed: 11, aimError: 0.018, hearing: 1.1, viewRange: 100,
    halfFov: 0.96, memory: 4, burstLen: [0.25, 0.5], burstPause: [0.1, 0.25], headChance: 0.3,
  },
});

export function difficultyParams(id) {
  return Object.prototype.hasOwnProperty.call(DIFFICULTIES, id) ? DIFFICULTIES[id] : DIFFICULTIES.orta;
}

const SITE_NODE = { A: 'SITEW', B: 'SITEE' };
const HOLDS = {
  CT: { A: ['SITEW', 'CTGW', 'SE3W', 'SXW'], B: ['SITEE', 'CTGE', 'SE3E', 'SXE'] },
  T: { A: ['SE3W', 'SXW', 'SE2W', 'SITEW'], B: ['SE3E', 'SXE', 'SE2E', 'SITEE'] },
};
const RETREAT_HEALTH = 30;
const NODE_REACH = 1.3;

function nodeByName(id) {
  return WAYPOINTS.nodes[WAYPOINTS.index.get(id)];
}

function normAngle(a) {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function between(rng, range) {
  return range[0] + (range[1] - range[0]) * rng();
}

export function createBrain(sim, p, difficulty) {
  return {
    state: BOT_STATES.PATROL,
    params: difficultyParams(difficulty),
    site: sim.rng() < 0.5 ? 'A' : 'B',
    path: null, pathIdx: 0, pathGoal: -1,
    target: null, heard: null, lookAt: null, hurtBy: null,
    burstTime: 0, burstPause: 0, aimOffset: [0, 0], aimTimer: 0,
    strafe: 1, strafeTimer: 0,
    holdIdx: 0, holdTimer: 0, scanPhase: sim.rng() * 6,
    stuckTimer: 0, stuckPos: [p.body.x, p.body.z], stuckCheck: 0, unstick: 0, unstickDir: 1,
    grenadeCooldown: 3 + sim.rng() * 4,
  };
}

/** Splits T and CT bots between sites A and B for the new round. */
export function assignRoles(sim) {
  for (const team of [TEAM_T, TEAM_CT]) {
    const bots = [...sim.players.values()].filter((p) => p.team === team && p.brain);
    let flip = sim.rng() < 0.5 ? 0 : 1;
    for (const b of bots) {
      b.brain.site = flip % 2 === 0 ? 'A' : 'B';
      flip += 1;
    }
  }
}

/** Items a bot wants to buy this round, in priority order. */
export function chooseBuys(sim, p) {
  const list = [];
  let money = p.inv.money;
  const price = (id) => getWeapon(id).price;
  const allowed = new Set(buyList(p.team).map((w) => w.id));
  const want = (id) => {
    if (allowed.has(id) && money >= price(id)) { list.push(id); money -= price(id); return true; }
    return false;
  };
  const rifle = p.team === TEAM_T ? 'ak47' : 'm4a4';
  const awpChance = p.brain && p.brain.params.id === 'qiyin' ? 0.25 : 0.1;
  if (!p.inv.primary) {
    if (money >= 5400 && sim.rng() < awpChance) want('awp');
    else if (money >= price(rifle) + 650) want(rifle);
    else if (money >= price('mp5') + 650) want('mp5');
    else if (money >= 2400 && sim.rng() < 0.4) want('mp5');
  }
  if (p.inv.armor <= 0 && money >= 650 && (list.length > 0 || money >= 1200)) want('armor');
  if (!list.length && p.inv.secondary !== 'deagle' && money >= 1500 && sim.rng() < 0.5) want('deagle');
  if (p.team === TEAM_CT && !p.inv.hasKit) want('kit');
  for (const g of ['he', 'flash', 'smoke']) if (sim.rng() < 0.6) want(g);
  return list;
}

// ---- perception ------------------------------------------------------------------------

function canSee(sim, p, b, e) {
  const dx = e.body.x - p.body.x;
  const dz = e.body.z - p.body.z;
  const dist = Math.hypot(dx, dz);
  if (dist > b.params.viewRange || p.flash > 0.6) return false;
  if (dist > 3) {
    const fwd = directionFromAngles(p.yaw, 0);
    const dot = (fwd[0] * dx + fwd[2] * dz) / dist;
    if (dot < Math.cos(b.params.halfFov)) return false;
  }
  const eye = eyePosition(p.body);
  for (const h of [1.1, PLAYER_EYE_HEIGHT]) {
    const point = [e.body.x, e.body.y + h, e.body.z];
    if (hasLineOfSight(sim.map, eye, point) && !sim.smokeBlocks(eye, point)) return true;
  }
  return false;
}

function perceive(sim, p, b, dt) {
  const now = sim.time;
  if (b.hurtBy) {
    const att = sim.players.get(b.hurtBy);
    if (att && att.alive) b.heard = { x: att.body.x, z: att.body.z, t: 3 };
    b.hurtBy = null;
  }
  for (const s of sim.sounds) {
    if (s.team === p.team) continue;
    if (Math.hypot(s.x - p.body.x, s.z - p.body.z) <= s.radius * b.params.hearing) {
      b.heard = { x: s.x, z: s.z, t: 4 };
      b.lookAt = { x: s.x, z: s.z, t: 1.5 };
    }
  }
  if (b.heard) { b.heard.t -= dt; if (b.heard.t <= 0) b.heard = null; }
  if (b.lookAt) { b.lookAt.t -= dt; if (b.lookAt.t <= 0) b.lookAt = null; }

  let best = null;
  let bestD = Infinity;
  for (const e of sim.players.values()) {
    if (!e.alive || e.team === p.team) continue;
    if (!canSee(sim, p, b, e)) continue;
    const d = Math.hypot(e.body.x - p.body.x, e.body.z - p.body.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) {
    if (!b.target || b.target.id !== best.id) {
      const alert = b.heard && Math.hypot(b.heard.x - best.body.x, b.heard.z - best.body.z) < 12 ? 0.5 : 1;
      b.target = { id: best.id, acquire: b.params.reaction * alert, lastPos: null, lastSeen: now, visible: true };
      b.aimTimer = 0;
    }
    b.target.visible = true;
    b.target.lastSeen = now;
    b.target.lastPos = [best.body.x, best.body.y, best.body.z];
    b.target.acquire = Math.max(0, b.target.acquire - dt);
  } else if (b.target) {
    const e = sim.players.get(b.target.id);
    b.target.visible = false;
    if (!e || !e.alive || now - b.target.lastSeen > b.params.memory) {
      if (e && e.alive) b.heard = { x: b.target.lastPos[0], z: b.target.lastPos[2], t: 4 };
      b.target = null;
    }
  }
}

// ---- navigation ------------------------------------------------------------------------

function goTo(p, b, x, z, y, radius = 1) {
  const bx = p.body.x;
  const bz = p.body.z;
  if (Math.hypot(x - bx, z - bz) <= radius) { b.path = null; return { arrived: true, dx: 0, dz: 0 }; }
  const goal = nearestWaypoint(WAYPOINTS, x, z, y);
  if (!b.path || b.pathGoal !== goal) {
    const start = nearestWaypoint(WAYPOINTS, bx, bz, p.body.y);
    let path = findPath(WAYPOINTS, start, goal) ?? [goal];
    if (path.length > 1) {
      const n0 = WAYPOINTS.nodes[path[0]];
      const n1 = WAYPOINTS.nodes[path[1]];
      if (Math.hypot(n1.x - bx, n1.z - bz) < Math.hypot(n1.x - n0.x, n1.z - n0.z)) path = path.slice(1);
    }
    b.path = path;
    b.pathIdx = 0;
    b.pathGoal = goal;
  }
  while (b.pathIdx < b.path.length) {
    const n = WAYPOINTS.nodes[b.path[b.pathIdx]];
    if (Math.hypot(n.x - bx, n.z - bz) < NODE_REACH && Math.abs(n.y - p.body.y) < 1.5) b.pathIdx += 1;
    else break;
  }
  if (b.pathIdx < b.path.length) {
    const n = WAYPOINTS.nodes[b.path[b.pathIdx]];
    return { arrived: false, dx: n.x - bx, dz: n.z - bz };
  }
  return { arrived: false, dx: x - bx, dz: z - bz };
}

function setMove(out, p, dx, dz) {
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return;
  const wx = dx / len;
  const wz = dz / len;
  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  out.mz = -sin * wx - cos * wz;
  out.mx = cos * wx - sin * wz;
}

function turnTo(p, yaw, pitch, speed, dt) {
  const dy = normAngle(yaw - p.yaw);
  const step = speed * dt;
  const ny = Math.abs(dy) <= step ? yaw : p.yaw + Math.sign(dy) * step;
  const dp = pitch - p.pitch;
  const np = Math.abs(dp) <= step ? pitch : p.pitch + Math.sign(dp) * step;
  return { yaw: ny, pitch: np, error: Math.max(Math.abs(dy), Math.abs(dp)) };
}

function yawTo(p, x, z) {
  return Math.atan2(-(x - p.body.x), -(z - p.body.z));
}

// ---- main think ------------------------------------------------------------------------

function wantedSlot(p) {
  const has = (id) => id && (p.ammo[id]?.mag > 0 || p.ammo[id]?.reserve > 0);
  if (has(p.inv.primary)) return 'primary';
  if (has(p.inv.secondary)) return 'secondary';
  return 'knife';
}

function nearestBot(sim, team, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const o of sim.players.values()) {
    if (!o.alive || o.team !== team || !o.brain) continue;
    const d = Math.hypot(o.body.x - x, o.body.z - z);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

function holdPoint(b, team) {
  const list = HOLDS[team][b.site];
  return nodeByName(list[b.holdIdx % list.length]);
}

/** Moves between the hold positions of a site while scanning for enemies. */
function holdSite(sim, p, b, out, dt, team) {
  const node = holdPoint(b, team);
  const res = goTo(p, b, node.x, node.z, node.y, 1.5);
  if (res.arrived) {
    b.holdTimer -= dt;
    if (b.holdTimer <= 0) {
      b.holdIdx = (b.holdIdx + 1) % HOLDS[team][b.site].length;
      b.holdTimer = 4 + sim.rng() * 5;
    }
    b.scanPhase += dt * 0.8;
    const base = team === TEAM_CT ? 0 : Math.PI;
    out.aimYaw = base + Math.sin(b.scanPhase) * 0.9;
    out.aimPitch = 0;
    return BOT_STATES.DEFEND;
  }
  setMove(out, p, res.dx, res.dz);
  out.aimYaw = Math.atan2(-res.dx, -res.dz);
  out.aimPitch = 0;
  return BOT_STATES.PATROL;
}

function objective(sim, p, b, out, dt) {
  const bomb = sim.match.bomb;
  const planted = bomb.state === BOMB_PLANTED && sim.bombPos;
  if (p.team === TEAM_T) {
    if (planted) {
      b.site = bomb.site ?? b.site;
      return holdSite(sim, p, b, out, dt, TEAM_T);
    }
    if (sim.bombCarrier === p.id) {
      const site = SITES.find((s) => s.id === b.site);
      const res = goTo(p, b, site.center[0], site.center[1], 0, 2);
      if (res.arrived) {
        out.use = true;
        out.mx = 0; out.mz = 0;
        return BOT_STATES.PLANT;
      }
      setMove(out, p, res.dx, res.dz);
      out.aimYaw = Math.atan2(-res.dx, -res.dz);
      out.aimPitch = 0;
      return BOT_STATES.PATROL;
    }
    if (sim.droppedBomb && nearestBot(sim, TEAM_T, sim.droppedBomb.x, sim.droppedBomb.z) === p) {
      const res = goTo(p, b, sim.droppedBomb.x, sim.droppedBomb.z, sim.droppedBomb.y, 0.5);
      setMove(out, p, res.dx, res.dz);
      out.aimYaw = Math.atan2(-res.dx, -res.dz);
      out.aimPitch = 0;
      return BOT_STATES.PATROL;
    }
  } else if (planted) {
    const bp = sim.bombPos;
    const defuser = nearestBot(sim, TEAM_CT, bp.x, bp.z);
    if (defuser === p) {
      const res = goTo(p, b, bp.x, bp.z, bp.y, 1.8);
      if (res.arrived) {
        out.use = true;
        return BOT_STATES.DEFUSE;
      }
      setMove(out, p, res.dx, res.dz);
      out.aimYaw = Math.atan2(-res.dx, -res.dz);
      out.aimPitch = 0;
      return BOT_STATES.PATROL;
    }
    b.site = bomb.site ?? b.site;
    return holdSite(sim, p, b, out, dt, TEAM_CT);
  }
  if (b.heard && Math.hypot(b.heard.x - p.body.x, b.heard.z - p.body.z) < 35) {
    const res = goTo(p, b, b.heard.x, b.heard.z, 0, 2);
    if (!res.arrived) {
      setMove(out, p, res.dx, res.dz);
      out.aimYaw = Math.atan2(-res.dx, -res.dz);
      out.aimPitch = 0;
      out.walk = true;
      return BOT_STATES.PATROL;
    }
    b.heard = null;
  }
  return holdSite(sim, p, b, out, dt, p.team);
}

function attack(sim, p, b, out, dt) {
  const t = b.target;
  const e = sim.players.get(t.id);
  const weapon = getWeapon(p.cur);
  const tp = t.lastPos;
  const dist = Math.hypot(tp[0] - p.body.x, tp[2] - p.body.z);
  b.aimTimer -= dt;
  if (b.aimTimer <= 0) {
    const amp = b.params.aimError * (1 + dist / 50);
    b.aimOffset = [(sim.rng() + sim.rng() - 1) * amp, (sim.rng() + sim.rng() - 1) * amp * 0.6];
    b.aimTimer = 0.4;
  }
  const head = t.headshot ?? (t.headshot = sim.rng() < b.params.headChance);
  const aimY = tp[1] + (head ? 1.55 : 1.05);
  const eye = eyePosition(p.body);
  const horiz = Math.max(0.1, dist);
  out.aimYaw = yawTo(p, tp[0], tp[2]) + b.aimOffset[0];
  out.aimPitch = Math.atan2(aimY - eye[1], horiz) + b.aimOffset[1];

  // Grenades: HE at a spot the enemy just left, flash in a fight, smoke when hurt.
  b.grenadeCooldown -= dt;
  if (b.grenadeCooldown <= 0 && dist > 8 && dist < 22) {
    const pick = !t.visible && p.inv.grenades.he > 0 ? 'he'
      : t.visible && p.inv.grenades.flash > 0 && sim.rng() < 0.01 ? 'flash'
        : p.health < 50 && t.visible && p.inv.grenades.smoke > 0 ? 'smoke' : null;
    if (pick) {
      const v = getWeapon(pick).throwSpeed;
      const lob = 0.5 * Math.asin(Math.min(1, (dist * GRENADE_GRAVITY) / (v * v)));
      out.aimYaw = yawTo(p, tp[0], tp[2]);
      out.aimPitch = lob + 0.05;
      b.pendingThrow = pick;
    }
  }
  const aim = turnTo(p, out.aimYaw, out.aimPitch, b.params.turnSpeed, dt);
  out.yaw = aim.yaw;
  out.pitch = aim.pitch;
  out.turned = true;
  if (b.pendingThrow && aim.error < 0.12) {
    out.throw = b.pendingThrow;
    b.pendingThrow = null;
    b.grenadeCooldown = 8 + sim.rng() * 6;
  } else if (b.pendingThrow && b.grenadeCooldown < -3) {
    b.pendingThrow = null;
  }

  const a = p.ammo[p.cur];
  if (a && a.mag === 0 && a.reserve > 0) out.reload = true;

  const canShoot = t.visible && t.acquire <= 0 && e && e.alive && !b.pendingThrow;
  if (canShoot) {
    const tolerance = 0.03 + 0.6 / Math.max(5, dist * 4);
    if (aim.error < tolerance + 0.02) {
      if (weapon.auto) {
        if (b.burstPause > 0) b.burstPause -= dt;
        else {
          out.fire = true;
          b.burstTime += dt;
          if (b.burstTime > between(sim.rng, b.params.burstLen)) {
            b.burstTime = 0;
            b.burstPause = between(sim.rng, b.params.burstPause);
          }
        }
      } else {
        out.fire = !p.prevFire;
      }
    }
    if (weapon.category === CATEGORY_SNIPER && dist > 20) out.scope = true;
  }

  // Movement: peek toward the last known position when out of sight, strafe when visible.
  if (!t.visible) {
    const res = goTo(p, b, tp[0], tp[2], tp[1], 2);
    if (!res.arrived && b.params.id !== 'oson') {
      setMove(out, p, res.dx, res.dz);
      out.walk = true;
    }
  } else if (weapon.category !== CATEGORY_SNIPER) {
    b.strafeTimer -= dt;
    if (b.strafeTimer <= 0) {
      b.strafe = sim.rng() < 0.5 ? -1 : 1;
      b.strafeTimer = 0.4 + sim.rng() * 0.6;
    }
    if (b.params.id !== 'oson' || sim.rng() < 0.3) out.mx = b.strafe * 0.8;
    if (b.params.id === 'qiyin') out.walk = true;
    if (dist > 45) out.mz = 0.6;
    else if (dist < 6) out.mz = -0.4;
  }
  return BOT_STATES.ATTACK;
}

function retreat(sim, p, b, out) {
  const home = nodeByName(p.team === TEAM_T ? 'T0' : 'CT0');
  const res = goTo(p, b, home.x, home.z, 0, 2);
  if (!res.arrived) setMove(out, p, res.dx, res.dz);
  out.aimYaw = res.arrived ? p.yaw : Math.atan2(-res.dx, -res.dz);
  out.aimPitch = 0;
  return BOT_STATES.RETREAT;
}

function unstick(sim, p, b, out, dt) {
  b.stuckCheck += dt;
  if (b.stuckCheck < 0.5) return;
  b.stuckCheck = 0;
  const moved = Math.hypot(p.body.x - b.stuckPos[0], p.body.z - b.stuckPos[1]);
  b.stuckPos = [p.body.x, p.body.z];
  if ((out.mx !== 0 || out.mz !== 0) && moved < 0.2) b.stuckTimer += 0.5;
  else b.stuckTimer = 0;
  if (b.stuckTimer >= 1) {
    b.unstick = 0.6;
    b.unstickDir = sim.rng() < 0.5 ? -1 : 1;
    b.path = null;
    b.stuckTimer = 0;
  }
}

/** Produces this tick's input command for a bot. */
export function thinkBot(sim, p, dt) {
  const b = p.brain;
  const out = {
    seq: p.lastSeq + 1, mx: 0, mz: 0, yaw: p.yaw, pitch: p.pitch, jump: false, fire: false, reload: false,
    walk: false, use: false, scope: false, slot: null, throw: null, aimYaw: p.yaw, aimPitch: 0,
  };
  const want = wantedSlot(p);
  if ((want === 'primary' && p.cur !== p.inv.primary) || (want === 'secondary' && p.cur !== p.inv.secondary)
    || (want === 'knife' && p.cur !== 'knife')) out.slot = want;

  perceive(sim, p, b, dt);

  let state;
  if (b.target && (b.target.visible || sim.time - b.target.lastSeen < b.params.memory)) {
    const busyPlanting = p.team === TEAM_T && sim.bombCarrier === p.id && sim.match.bomb.state === BOMB_PLANTING
      && (!b.target.visible || Math.hypot(b.target.lastPos[0] - p.body.x, b.target.lastPos[2] - p.body.z) > 25);
    const busyDefusing = sim.match.bomb.defuser === p.id && !b.target.visible;
    if (busyPlanting || busyDefusing) {
      out.use = true;
      state = busyPlanting ? BOT_STATES.PLANT : BOT_STATES.DEFUSE;
    } else if (p.health < RETREAT_HEALTH && sim.match.bomb.defuser !== p.id) {
      state = retreat(sim, p, b, out);
      if (b.target.visible) { out.aimYaw = yawTo(p, b.target.lastPos[0], b.target.lastPos[2]); }
    } else {
      state = attack(sim, p, b, out, dt);
    }
  } else {
    state = objective(sim, p, b, out, dt);
  }
  b.state = state;

  if (!out.turned) {
    let ty = out.aimYaw;
    if (b.lookAt && state !== BOT_STATES.PLANT && state !== BOT_STATES.DEFUSE) ty = yawTo(p, b.lookAt.x, b.lookAt.z);
    const aim = turnTo(p, ty, out.aimPitch, b.params.turnSpeed * 0.7, dt);
    out.yaw = aim.yaw;
    out.pitch = aim.pitch;
  }

  // Reload quietly when no enemy is around.
  const a = p.ammo[p.cur];
  const w = getWeapon(p.cur);
  if (!b.target && a && w.mag > 0 && a.mag < w.mag * 0.4 && a.reserve > 0) out.reload = true;

  if (sim.isLive()) {
    if (b.unstick > 0) {
      b.unstick -= dt;
      out.jump = true;
      out.mx = b.unstickDir;
      out.mz = 0.5;
    } else {
      unstick(sim, p, b, out, dt);
    }
  }
  delete out.aimYaw;
  delete out.aimPitch;
  delete out.turned;
  return out;
}
