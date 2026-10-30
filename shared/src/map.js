// Original large bunker map as shared data. Used by the server and the client alike.
// Coordinates are meters: x grows east, z grows south, y is up. The T base is in the north
// (z < -62) and the CT base is in the south (z > 62). Site A is in the south-west, site B in
// the south-east. Mirrored geometry is generated from one description so both halves match.
import { PLAYER_RADIUS, TEAM_CT, TEAM_T, TEAM_SIZE } from './constants.js';
import { isBlocked } from './collision.js';

export const WALL_HEIGHT = 6;
const WALL_THICKNESS = 1;
export const UPPER_FLOOR_Y = 4;
const SLAB_THICKNESS = 0.5;
const STAIR_STEPS = 10;
const STAIR_RISE = UPPER_FLOOR_Y / STAIR_STEPS;

const boxes = [];
const ramps = [];
const props = [];

function addBox(kind, x0, y0, z0, x1, y1, z1) {
  boxes.push({ kind, min: [x0, y0, z0], max: [x1, y1, z1] });
}

/** Wall along z at constant x, split by gaps [[z0, z1], ...]. */
function wallAlongZ(x, z0, z1, gaps = []) {
  let from = z0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g0 > from) addBox('wall', x - WALL_THICKNESS / 2, 0, from, x + WALL_THICKNESS / 2, WALL_HEIGHT, g0);
    from = g1;
  }
  if (z1 > from) addBox('wall', x - WALL_THICKNESS / 2, 0, from, x + WALL_THICKNESS / 2, WALL_HEIGHT, z1);
}

/** Wall along x at constant z, split by gaps [[x0, x1], ...]. */
function wallAlongX(z, x0, x1, gaps = []) {
  let from = x0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g0 > from) addBox('wall', from, 0, z - WALL_THICKNESS / 2, g0, WALL_HEIGHT, z + WALL_THICKNESS / 2);
    from = g1;
  }
  if (x1 > from) addBox('wall', from, 0, z - WALL_THICKNESS / 2, x1, WALL_HEIGHT, z + WALL_THICKNESS / 2);
}

function crate(x, z, size = 2, height = size) {
  const h = size / 2;
  addBox('crate', x - h, 0, z - h, x + h, height, z + h);
}

function barrel(x, z) {
  addBox('barrel', x - 0.5, 0, z - 0.5, x + 0.5, 1.2, z + 0.5);
}

function pillar(x, z, size = 1.2) {
  addBox('pillar', x - size / 2, 0, z - size / 2, x + size / 2, WALL_HEIGHT, z + size / 2);
}

/** Metal stairs climbing along z. Step 1 is next to zStart; the last step touches the upper floor. */
function stairsAlongZ(x0, x1, zStart, direction) {
  for (let i = 1; i <= STAIR_STEPS; i++) {
    const near = zStart + direction * (i - 1);
    const far = zStart + direction * i;
    addBox('stairs', x0, 0, Math.min(near, far), x1, STAIR_RISE * i, Math.max(near, far));
  }
  props.push({
    type: 'hazard_stripe', pos: [(x0 + x1) / 2, 0.02, zStart - direction * 0.6], size: [x1 - x0, 1.2], rotation: 0,
  });
}

function upperSlab(x0, z0, x1, z1) {
  addBox('platform', x0, UPPER_FLOOR_Y - SLAB_THICKNESS, z0, x1, UPPER_FLOOR_Y, z1);
}

/** Calls fn(sign) for west (-1) and east (+1) so symmetrical geometry is described once. */
function mirrored(fn) {
  fn(-1);
  fn(1);
}

// Outer shell.
wallAlongX(-88, -60.5, 60.5);
wallAlongX(88, -60.5, 60.5);
wallAlongZ(-60, -88, 88);
wallAlongZ(60, -88, 88);

// T base front wall: exits to A long, the middle hall and B long.
wallAlongX(-62, -59.5, 59.5, [[-52, -40], [-6, 6], [40, 52]]);

mirrored((s) => {
  // Long corridor wall between the side lane and the middle hall, with two cross windows.
  wallAlongZ(38 * s, -62, 36, [[-46, -38], [8, 16]]);
  // Corner closing the middle hall toward the site.
  wallAlongX(36, ...(s < 0 ? [-38, -24] : [24, 38]));
  // Wall between the middle hall / CT base and the bomb site (short path and CT door).
  wallAlongZ(24 * s, 36, 88, [[46, 54], [70, 80]]);
});
// CT base north wall with a central door.
wallAlongX(62, -24, 24, [[-6, 6]]);

// Two-level area in the middle hall: stair towers and a bridge across the hall.
mirrored((s) => {
  const x0 = s < 0 ? -37.5 : 26;
  const x1 = s < 0 ? -26 : 37.5;
  upperSlab(x0, -30, x1, -14);
  const sx0 = s < 0 ? -36 : 30;
  stairsAlongZ(sx0, sx0 + 6, -4, -1);
  // Support pillars under the platform corners.
  addBox('pillar', x0, 0, -30, x0 + 0.6, UPPER_FLOOR_Y - SLAB_THICKNESS, -29.4);
  addBox('pillar', x1 - 0.6, 0, -30, x1, UPPER_FLOOR_Y - SLAB_THICKNESS, -29.4);
});
upperSlab(-26, -24, 26, -20);
// Solid building in the middle of the hall.
addBox('wall', -12, 0, -8, 12, WALL_HEIGHT, 14);

// Site A balcony with metal stairs.
upperSlab(-60, 44, -44, 62);
stairsAlongZ(-56, -50, 34, 1);
addBox('pillar', -45, 0, 61, -44, UPPER_FLOOR_Y - SLAB_THICKNESS, 62);
// Site B balcony with a ramp.
upperSlab(44, 44, 60, 62);
ramps.push({ min: [30, 56], max: [44, 62], axis: 'x', y0: 0, y1: UPPER_FLOOR_Y });
addBox('pillar', 44, 0, 61, 45, UPPER_FLOOR_Y - SLAB_THICKNESS, 62);

// Cover: T base.
mirrored((s) => {
  crate(22 * s, -82, 3);
  crate(12 * s, -66, 2);
  pillar(16 * s, -76, 1);
  barrel(26 * s, -84);
  barrel(27.2 * s, -83.6);
  crate(36 * s, -74, 2.5);
});
// Cover: long corridors (A long on the west, B long on the east).
mirrored((s) => {
  crate(56 * s, -35, 2.5);
  crate(55 * s, -5, 2.5, 1.5);
  barrel(57 * s, 18);
  barrel(41.5 * s, -26);
  pillar(41.5 * s, 2, 1);
  crate(54 * s, 24, 3);
});
// Cover: middle hall.
mirrored((s) => {
  crate(28 * s, -54, 2.5);
  pillar(24 * s, -10);
  pillar(24 * s, 26);
  crate(8 * s, -14, 2);
  crate(8 * s, 24, 2.5);
  barrel(22 * s, 4);
  crate(30 * s, -44, 2);
});
// Cover: bomb sites.
mirrored((s) => {
  crate(52 * s, 80, 3);
  crate(34 * s, 82, 2.5);
  barrel(30 * s, 69);
  crate(48 * s, 68, 2, 1.5);
  crate(40 * s, 82, 2);
  pillar(34 * s, 76);
});
// Cover: CT base.
mirrored((s) => {
  crate(18 * s, 84, 2.5);
  pillar(8 * s, 66, 1);
  barrel(20 * s, 66);
});

// Decorative props (non-colliding): lamps, vents, pipes, terminals, hazard stripes.
function lampRow(xs, zs) {
  for (const x of xs) for (const z of zs) props.push({ type: 'lamp', pos: [x, WALL_HEIGHT - 0.4, z] });
}
lampRow([-30, 0, 30], [-80, -66]);
lampRow([-48, 48], [-50, -30, -10, 10, 30]);
lampRow([-24, 0, 24], [-48, -34, -2, 20, 40, 56]);
lampRow([-45, 45], [66, 80]);
lampRow([-8, 8], [68, 80]);
for (let z = -50; z <= 30; z += 20) {
  props.push({ type: 'vent', pos: [-59.4, 4.6, z], size: [1.4, 0.8], facing: 'east' });
  props.push({ type: 'vent', pos: [59.4, 4.6, z], size: [1.4, 0.8], facing: 'west' });
}
for (const x of [-48, 48]) {
  props.push({ type: 'pipe', from: [x - 4, 5.4, -60], to: [x - 4, 5.4, 34], radius: 0.18 });
}
props.push({ type: 'pipe', from: [-36, 5.2, -61], to: [36, 5.2, -61], radius: 0.2 });
props.push({ type: 'pipe', from: [-23, 5.2, 70], to: [23, 5.2, 70], radius: 0.2 });
props.push({ type: 'terminal', pos: [-10, 0, -86.5], rotation: 0 });
props.push({ type: 'terminal', pos: [10, 0, -86.5], rotation: 0 });
props.push({ type: 'terminal', pos: [-6, 0, 86.5], rotation: Math.PI });
props.push({ type: 'terminal', pos: [6, 0, 86.5], rotation: Math.PI });

export const SITES = [
  { id: 'A', min: [-56, 64], max: [-28, 86], center: [-42, 75] },
  { id: 'B', min: [28, 64], max: [56, 86], center: [42, 75] },
];

for (const site of SITES) {
  // Hazard stripes outline each bomb site on the floor.
  props.push({ type: 'hazard_stripe', pos: [site.center[0], 0.02, site.min[1]], size: [site.max[0] - site.min[0], 0.6], rotation: 0 });
  props.push({ type: 'hazard_stripe', pos: [site.center[0], 0.02, site.max[1]], size: [site.max[0] - site.min[0], 0.6], rotation: 0 });
  props.push({ type: 'site_marker', id: site.id, pos: [site.center[0], 0.03, site.center[1]] });
}

function spawnRow(team, z, yaw) {
  return [-8, -4, 0, 4, 8].slice(0, TEAM_SIZE).map((x) => ({ team, x, y: 0, z, yaw }));
}

export const SPAWNS = {
  // Yaw 0 looks toward -z, so T players (north) face south (pi) and CT players face north (0).
  [TEAM_T]: spawnRow(TEAM_T, -80, Math.PI),
  [TEAM_CT]: spawnRow(TEAM_CT, 78, 0),
};

export const MAP = Object.freeze({
  name: 'Po\'lat bunker',
  bounds: { min: [-60, -88], max: [60, 88] },
  boxes,
  ramps,
  props,
  sites: SITES,
  spawns: SPAWNS,
  /** Where the bomb carrier's team (T) can plant: the site rectangles on the ground floor. */
  bombTeam: TEAM_T,
});

/** Returns the site containing the (x, z) point, or null. */
export function siteAt(map, x, z) {
  for (const s of map.sites) {
    if (x >= s.min[0] && x <= s.max[0] && z >= s.min[1] && z <= s.max[1]) return s;
  }
  return null;
}

export function spawnsFor(map, team) {
  return map.spawns[team];
}

/** Returns a list of human readable problems. An empty list means the map data is consistent. */
export function validateMap(map) {
  const errors = [];
  for (const [i, b] of map.boxes.entries()) {
    for (let a = 0; a < 3; a++) {
      if (!(b.min[a] < b.max[a])) errors.push(`box ${i} (${b.kind}) has non-positive extent on axis ${a}`);
    }
  }
  for (const [i, r] of map.ramps.entries()) {
    if (!(r.min[0] < r.max[0] && r.min[1] < r.max[1])) errors.push(`ramp ${i} has non-positive extent`);
  }
  for (const team of [TEAM_CT, TEAM_T]) {
    const list = map.spawns[team];
    if (!list || list.length !== TEAM_SIZE) errors.push(`team ${team} needs ${TEAM_SIZE} spawns`);
    for (const [i, s] of (list ?? []).entries()) {
      if (isBlocked(map, s.x, s.y, s.z, PLAYER_RADIUS)) errors.push(`spawn ${team}#${i} is inside geometry`);
      if (s.x < map.bounds.min[0] || s.x > map.bounds.max[0] || s.z < map.bounds.min[1] || s.z > map.bounds.max[1]) {
        errors.push(`spawn ${team}#${i} is outside the map bounds`);
      }
    }
  }
  if (map.sites.length !== 2) errors.push('map needs exactly two bomb sites');
  for (const s of map.sites) {
    if (isBlocked(map, s.center[0], 0, s.center[1], PLAYER_RADIUS)) errors.push(`site ${s.id} center is inside geometry`);
  }
  return errors;
}
