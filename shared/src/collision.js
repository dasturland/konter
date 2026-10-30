// AABB collision, ground heights (steps, ramps) and raycasts against map geometry.
import {
  GRAVITY, PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_RADIUS, STEP_HEIGHT,
} from './constants.js';

const EPS = 1e-4;
/** Largest horizontal distance moved per sub-step, smaller than the thinnest wall. */
const MAX_SUBSTEP = 0.25;

/** Height of a ramp surface at (x, z); coordinates are clamped to the ramp. */
export function rampHeightAt(ramp, x, z) {
  const cx = Math.max(ramp.min[0], Math.min(ramp.max[0], x));
  const cz = Math.max(ramp.min[1], Math.min(ramp.max[1], z));
  const t = ramp.axis === 'x'
    ? (cx - ramp.min[0]) / (ramp.max[0] - ramp.min[0])
    : (cz - ramp.min[1]) / (ramp.max[1] - ramp.min[1]);
  return ramp.y0 + (ramp.y1 - ramp.y0) * t;
}

function footprintOverlapsRamp(ramp, x, z, r) {
  return x + r > ramp.min[0] && x - r < ramp.max[0] && z + r > ramp.min[1] && z - r < ramp.max[1];
}

/** Highest ramp surface under the footprint of a body at (x, z). */
function rampSurface(ramp, x, z, r) {
  return Math.max(
    rampHeightAt(ramp, x - r, z - r), rampHeightAt(ramp, x + r, z - r),
    rampHeightAt(ramp, x - r, z + r), rampHeightAt(ramp, x + r, z + r),
  );
}

/**
 * Highest walkable surface a body whose feet are at feetY can stand on at (x, z).
 * Surfaces higher than feetY + STEP_HEIGHT are ignored.
 */
export function groundHeightAt(map, x, z, feetY, r = PLAYER_RADIUS) {
  const limit = feetY + STEP_HEIGHT + EPS;
  let best = 0;
  for (const b of map.boxes) {
    if (b.max[1] > best && b.max[1] <= limit
      && x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2]) {
      best = b.max[1];
    }
  }
  for (const ramp of map.ramps) {
    if (!footprintOverlapsRamp(ramp, x, z, r)) continue;
    const h = rampSurface(ramp, x, z, r);
    if (h > best && h <= limit) best = h;
  }
  return best;
}

/** True when a body with feet at (x, feetY, z) intersects solid geometry. */
export function isBlocked(map, x, feetY, z, r = PLAYER_RADIUS, height = PLAYER_HEIGHT) {
  const stepTop = feetY + STEP_HEIGHT + EPS;
  const headY = feetY + height;
  for (const b of map.boxes) {
    if (b.max[1] > stepTop && b.min[1] < headY
      && x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2]) {
      return true;
    }
  }
  for (const ramp of map.ramps) {
    if (footprintOverlapsRamp(ramp, x, z, r) && rampSurface(ramp, x, z, r) > stepTop) return true;
  }
  return false;
}

/** Lowest ceiling above a body, or Infinity. */
function ceilingHeight(map, x, z, r, feetY, height) {
  let best = Infinity;
  const headY = feetY + height;
  for (const b of map.boxes) {
    if (b.min[1] >= headY - EPS && b.min[1] < best
      && x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2]) {
      best = b.min[1];
    }
  }
  return best;
}

/**
 * Moves a player body {x,y,z,vy,onGround} by (dx, dz) horizontally, then applies gravity and jump.
 * Axes are resolved separately so players slide along walls. Mutates and returns the body.
 */
export function movePlayer(map, body, dx, dz, dt, jumpSpeed = 0) {
  const r = PLAYER_RADIUS;
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / MAX_SUBSTEP));
  const sx = dx / steps;
  const sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0 && !isBlocked(map, body.x + sx, body.y, body.z, r)) body.x += sx;
    if (sz !== 0 && !isBlocked(map, body.x, body.y, body.z + sz, r)) body.z += sz;
    if (body.onGround) {
      const g = groundHeightAt(map, body.x, body.z, body.y, r);
      if (g > body.y) body.y = g;
    }
  }

  if (jumpSpeed > 0 && body.onGround) {
    body.vy = jumpSpeed;
    body.onGround = false;
  }

  const ground = groundHeightAt(map, body.x, body.z, body.y, r);
  if (body.onGround && body.y - ground < STEP_HEIGHT && body.vy <= 0) {
    // Walk down stairs and ramps without becoming airborne.
    body.y = ground;
    body.vy = 0;
    return body;
  }
  body.vy -= GRAVITY * dt;
  let ny = body.y + body.vy * dt;
  if (body.vy > 0) {
    const ceil = ceilingHeight(map, body.x, body.z, r, body.y, PLAYER_HEIGHT);
    if (ny + PLAYER_HEIGHT > ceil) {
      ny = ceil - PLAYER_HEIGHT;
      body.vy = 0;
    }
  }
  if (ny <= ground && body.vy <= 0) {
    body.y = ground;
    body.vy = 0;
    body.onGround = true;
  } else {
    body.y = ny;
    body.onGround = false;
  }
  return body;
}

export function createBody(x, y, z) {
  return { x, y, z, vy: 0, onGround: true };
}

/** Ray vs AABB slab test. Returns distance t along the (normalized) direction or null. */
export function rayBox(origin, dir, min, max, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  for (let a = 0; a < 3; a++) {
    const o = origin[a];
    const d = dir[a];
    if (Math.abs(d) < 1e-9) {
      if (o < min[a] || o > max[a]) return null;
    } else {
      let t1 = (min[a] - o) / d;
      let t2 = (max[a] - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function rayRamp(origin, dir, ramp, maxDist) {
  // Intersect the slanted surface plane y = y0 + slope * (coord - min) within the ramp rectangle.
  const axisIndex = ramp.axis === 'x' ? 0 : 2;
  const lo = ramp.axis === 'x' ? ramp.min[0] : ramp.min[1];
  const len = ramp.axis === 'x' ? ramp.max[0] - ramp.min[0] : ramp.max[1] - ramp.min[1];
  const slope = (ramp.y1 - ramp.y0) / len;
  // Solve oy + t*dy = y0 + slope*(oc + t*dc - lo)
  const denom = dir[1] - slope * dir[axisIndex];
  if (Math.abs(denom) < 1e-9) return null;
  const t = (ramp.y0 + slope * (origin[axisIndex] - lo) - origin[1]) / denom;
  if (t < 0 || t > maxDist) return null;
  const x = origin[0] + dir[0] * t;
  const z = origin[2] + dir[2] * t;
  if (x < ramp.min[0] || x > ramp.max[0] || z < ramp.min[1] || z > ramp.max[1]) return null;
  return t;
}

/**
 * Casts a ray against all map geometry.
 * @param {number[]} origin [x,y,z]
 * @param {number[]} dir normalized direction
 * @returns {{distance:number, point:number[], kind:string}|null}
 */
export function raycast(map, origin, dir, maxDist = 200) {
  let best = null;
  let bestKind = '';
  for (const b of map.boxes) {
    const t = rayBox(origin, dir, b.min, b.max, best === null ? maxDist : best);
    if (t !== null && t >= 0 && (best === null || t < best)) { best = t; bestKind = b.kind; }
  }
  for (const ramp of map.ramps) {
    const t = rayRamp(origin, dir, ramp, best === null ? maxDist : best);
    if (t !== null && (best === null || t < best)) { best = t; bestKind = 'ramp'; }
  }
  if (best === null) return null;
  return {
    distance: best,
    point: [origin[0] + dir[0] * best, origin[1] + dir[1] * best, origin[2] + dir[2] * best],
    kind: bestKind,
  };
}

export function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len === 0 ? [0, 0, 0] : [v[0] / len, v[1] / len, v[2] / len];
}

/** True when nothing solid lies between two points. */
export function hasLineOfSight(map, from, to) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const dist = Math.hypot(d[0], d[1], d[2]);
  if (dist < EPS) return true;
  const hit = raycast(map, from, [d[0] / dist, d[1] / dist, d[2] / dist], dist - EPS);
  return hit === null;
}

/** Eye position of a body. */
export function eyePosition(body) {
  return [body.x, body.y + PLAYER_EYE_HEIGHT, body.z];
}

/** Ray vs player bounding box. Returns the distance and hit height, or null. */
export function rayPlayer(origin, dir, body, maxDist) {
  const min = [body.x - PLAYER_RADIUS, body.y, body.z - PLAYER_RADIUS];
  const max = [body.x + PLAYER_RADIUS, body.y + PLAYER_HEIGHT, body.z + PLAYER_RADIUS];
  const t = rayBox(origin, dir, min, max, maxDist);
  if (t === null) return null;
  return { distance: t, hitY: origin[1] + dir[1] * t };
}

/** Unit view direction from yaw/pitch. Yaw 0 looks toward -z; positive yaw turns toward -x. */
export function directionFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}
