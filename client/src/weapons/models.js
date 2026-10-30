// Procedural first-person weapon models. Every weapon type has its own shape; geometries and
// materials are cached and shared between instances. The gun points toward -z.
import * as THREE from 'three';

const mats = {
  gun: new THREE.MeshStandardMaterial({ color: 0x3b4046, metalness: 0.9, roughness: 0.38 }),
  gunLight: new THREE.MeshStandardMaterial({ color: 0x7c848c, metalness: 0.95, roughness: 0.3 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xaab2ba, metalness: 1, roughness: 0.22 }),
  black: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.6, roughness: 0.55 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7a4a26, metalness: 0.05, roughness: 0.75 }),
  green: new THREE.MeshStandardMaterial({ color: 0x3f5236, metalness: 0.4, roughness: 0.6 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x0d0d0f, metalness: 0.1, roughness: 0.85 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x1c2229, metalness: 0.05, roughness: 0.9 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x1b3a66, metalness: 0.9, roughness: 0.05, emissive: 0x0a1c3a }),
  smoke: new THREE.MeshStandardMaterial({ color: 0x8b949b, metalness: 0.6, roughness: 0.5 }),
  flash: new THREE.MeshStandardMaterial({ color: 0xe8e8ee, metalness: 0.5, roughness: 0.4 }),
  he: new THREE.MeshStandardMaterial({ color: 0x3d5a2e, metalness: 0.5, roughness: 0.55 }),
};

const geoCache = new Map();
function box(w, h, d) {
  const key = `b${w}|${h}|${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}
/** Cylinder lying along the z axis. */
function tube(r, len, seg = 12) {
  const key = `c${r}|${len}|${seg}`;
  if (!geoCache.has(key)) {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.rotateX(Math.PI / 2);
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}
function sphere(r) {
  const key = `s${r}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.SphereGeometry(r, 16, 12));
  return geoCache.get(key);
}

function part(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

function glovedHand(parent, x, y, z, { tilt = 0, side = 1, arm = true } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.x = tilt;
  part(g, box(0.062, 0.05, 0.095), mats.glove, 0, 0, 0);
  for (let i = 0; i < 4; i++) part(g, box(0.014, 0.016, 0.05), mats.glove, -0.021 + i * 0.014, 0.014, -0.065);
  part(g, box(0.02, 0.022, 0.06), mats.glove, -0.04 * side, 0.01, -0.02, 0, 0.5 * side, 0);
  if (arm) {
    part(g, box(0.075, 0.07, 0.34), mats.sleeve, 0.01 * side, -0.035, 0.24, -0.18, 0, 0);
    part(g, box(0.07, 0.058, 0.05), mats.glove, 0.0, -0.01, 0.07, -0.1, 0, 0);
  }
  parent.add(g);
  return g;
}

function makeMuzzle(parent, z, y = 0) {
  const o = new THREE.Object3D();
  o.position.set(0, y, z);
  parent.add(o);
  return o;
}

function rifle(o) {
  const g = new THREE.Group();
  const furn = o.furn;
  part(g, box(0.05, 0.085, 0.3), o.body, 0, 0, -0.05);
  part(g, box(0.056, 0.058, 0.26), furn, 0, -0.012, -0.33);
  part(g, tube(0.011, o.barrel), mats.steel, 0, 0.012, -0.46 - o.barrel / 2);
  part(g, tube(0.017, 0.05), mats.black, 0, 0.012, -0.48 - o.barrel);
  part(g, box(0.044, 0.1, o.stock), furn, 0, -0.012, 0.1 + o.stock / 2, 0.06, 0, 0);
  part(g, box(0.04, 0.1, 0.05), mats.black, 0, -0.085, 0.07, 0.35, 0, 0);
  const mag = new THREE.Group();
  part(mag, box(0.038, o.magH, 0.065), o.magMat, 0, -o.magH / 2, 0, o.magCurve, 0, 0);
  mag.position.set(0, -0.04, -0.07);
  g.add(mag);
  if (o.rail) {
    part(g, box(0.024, 0.012, 0.42), mats.black, 0, 0.048, -0.08);
    for (let i = 0; i < 9; i++) part(g, box(0.03, 0.01, 0.014), mats.gunLight, 0, 0.052, -0.26 + i * 0.045);
  }
  if (o.carry) {
    part(g, box(0.014, 0.05, 0.16), mats.black, 0, 0.075, -0.02);
    part(g, box(0.02, 0.012, 0.18), mats.black, 0, 0.1, -0.02);
  }
  // Open sights: front post with ring and a rear notch.
  part(g, box(0.006, 0.042, 0.008), mats.black, 0, 0.07, -0.55);
  part(g, box(0.03, 0.006, 0.006), mats.black, 0, 0.052, -0.55);
  part(g, box(0.008, 0.026, 0.01), mats.black, -0.012, 0.062, 0.04);
  part(g, box(0.008, 0.026, 0.01), mats.black, 0.012, 0.062, 0.04);
  glovedHand(g, 0.0, -0.1, 0.1, { tilt: 0.3 });
  glovedHand(g, -0.012, -0.06, -0.38, { tilt: 0, side: -1, arm: true });
  return { group: g, muzzle: makeMuzzle(g, -0.5 - o.barrel, 0.012), mag, adsY: 0.062 };
}

function pistol(o) {
  const g = new THREE.Group();
  part(g, box(0.03 * o.w, 0.042 * o.w, o.slide), o.body, 0, 0.04, -o.slide / 2 + 0.06);
  part(g, box(0.028 * o.w, 0.026, o.slide * 0.85), mats.black, 0, 0.012, -o.slide * 0.42 + 0.05);
  part(g, tube(0.008 * o.w, 0.02), mats.black, 0, 0.04, -o.slide + 0.06);
  part(g, box(0.034, 0.11, 0.05), mats.black, 0, -0.05, 0.04, 0.22, 0, 0);
  part(g, box(0.006, 0.02, 0.05), mats.black, 0, -0.01, -0.02);
  part(g, box(0.006, 0.014, 0.008), mats.black, 0, 0.068, -o.slide + 0.04);
  part(g, box(0.02, 0.012, 0.008), mats.black, 0, 0.066, 0.1);
  const mag = new THREE.Group();
  part(mag, box(0.026, 0.1, 0.038), mats.gunLight, 0, -0.05, 0);
  mag.position.set(0, -0.09, 0.05);
  g.add(mag);
  glovedHand(g, 0, -0.07, 0.07, { tilt: 0.25 });
  glovedHand(g, 0.03, -0.1, 0.0, { tilt: 0.2, side: -1, arm: false });
  return { group: g, muzzle: makeMuzzle(g, -o.slide + 0.04, 0.04), mag, adsY: 0.068 };
}

function smg(o) {
  const g = new THREE.Group();
  part(g, box(0.05, 0.08, 0.28), mats.black, 0, 0, -0.04);
  part(g, tube(0.028, 0.2), mats.gun, 0, 0.0, -0.28);
  part(g, tube(0.011, 0.1), mats.steel, 0, 0.0, -0.43);
  part(g, tube(0.016, 0.04), mats.black, 0, 0.0, -0.5);
  part(g, box(0.034, 0.075, 0.2), mats.black, 0, -0.01, 0.2, 0.05, 0, 0);
  part(g, box(0.03, 0.1, 0.045), mats.black, 0, -0.08, 0.07, 0.3, 0, 0);
  part(g, box(0.034, 0.012, 0.09), mats.black, 0, 0.046, -0.04);
  part(g, box(0.006, 0.036, 0.008), mats.black, 0, 0.055, -0.4);
  const mag = new THREE.Group();
  part(mag, box(0.034, o.magH, 0.05), mats.gunLight, 0, -o.magH / 2, 0, -0.18, 0, 0);
  mag.position.set(0, -0.04, -0.07);
  g.add(mag);
  glovedHand(g, 0, -0.1, 0.1, { tilt: 0.3 });
  glovedHand(g, 0, -0.07, -0.26, { side: -1 });
  return { group: g, muzzle: makeMuzzle(g, -0.52), mag, adsY: 0.058 };
}

function sniper() {
  const g = new THREE.Group();
  part(g, box(0.05, 0.085, 0.4), mats.green, 0, 0, -0.1);
  part(g, tube(0.013, 0.7), mats.gun, 0, 0.008, -0.65);
  part(g, tube(0.02, 0.09), mats.black, 0, 0.008, -1.02);
  part(g, box(0.05, 0.12, 0.3), mats.green, 0, -0.02, 0.28, 0.08, 0, 0);
  part(g, box(0.04, 0.1, 0.05), mats.black, 0, -0.085, 0.07, 0.35, 0, 0);
  part(g, tube(0.032, 0.34), mats.black, 0, 0.1, -0.06);
  part(g, tube(0.04, 0.07), mats.black, 0, 0.1, -0.24);
  part(g, tube(0.036, 0.06), mats.black, 0, 0.1, 0.12);
  part(g, tube(0.03, 0.01), mats.lens, 0, 0.1, -0.275);
  part(g, tube(0.026, 0.01), mats.lens, 0, 0.1, 0.152);
  part(g, box(0.014, 0.04, 0.03), mats.black, 0, 0.058, -0.16);
  part(g, box(0.014, 0.04, 0.03), mats.black, 0, 0.058, 0.04);
  part(g, tube(0.007, 0.07), mats.steel, 0.045, 0.03, -0.0, 0, 0, 0.0);
  part(g, box(0.012, 0.012, 0.05), mats.steel, 0.07, 0.03, 0.02, 0, 0, 0);
  part(g, sphere(0.014), mats.steel, 0.075, 0.03, 0.05);
  const mag = new THREE.Group();
  part(mag, box(0.036, 0.06, 0.1), mats.black, 0, -0.03, 0);
  mag.position.set(0, -0.04, -0.06);
  g.add(mag);
  glovedHand(g, 0, -0.1, 0.1, { tilt: 0.3 });
  glovedHand(g, 0, -0.07, -0.4, { side: -1 });
  return { group: g, muzzle: makeMuzzle(g, -1.08, 0.008), mag, adsY: 0.1 };
}

function knife() {
  const g = new THREE.Group();
  part(g, box(0.014, 0.05, 0.22), mats.steel, 0, 0.01, -0.2);
  part(g, box(0.012, 0.03, 0.06), mats.steel, 0, 0.0, -0.33, 0.0, 0, 0);
  part(g, box(0.02, 0.05, 0.12), mats.black, 0, 0.0, -0.02);
  part(g, box(0.03, 0.07, 0.014), mats.gunLight, 0, 0.0, -0.09);
  glovedHand(g, 0, -0.02, 0.0, { tilt: 0.2 });
  return { group: g, muzzle: makeMuzzle(g, -0.4), mag: null, adsY: 0 };
}

function grenade(kind) {
  const g = new THREE.Group();
  if (kind === 'smoke') {
    part(g, tube(0.032, 0.14, 14), mats.smoke, 0, 0, -0.08);
    part(g, tube(0.02, 0.03, 12), mats.black, 0, 0, -0.17);
    part(g, tube(0.034, 0.02, 14), mats.black, 0, 0, -0.04);
  } else if (kind === 'flash') {
    part(g, tube(0.03, 0.12, 14), mats.flash, 0, 0, -0.08);
    part(g, tube(0.031, 0.025, 14), mats.black, 0, 0, -0.08);
    part(g, tube(0.02, 0.03, 12), mats.black, 0, 0, -0.16);
  } else {
    part(g, sphere(0.045), mats.he, 0, 0, -0.08);
    part(g, tube(0.018, 0.03, 12), mats.black, 0, 0.0, -0.13, 0, 0, 0);
  }
  part(g, box(0.01, 0.01, 0.1), mats.steel, 0.026, 0.02, -0.1);
  glovedHand(g, 0.0, -0.045, 0.0, { tilt: 0.1 });
  return { group: g, muzzle: makeMuzzle(g, -0.1), mag: null, adsY: 0 };
}

const BUILDERS = {
  ak47: () => rifle({ body: mats.gun, furn: mats.wood, barrel: 0.3, magH: 0.17, magCurve: -0.3, magMat: mats.gunLight, stock: 0.26, rail: false, carry: false }),
  m4a4: () => rifle({ body: mats.black, furn: mats.gun, barrel: 0.26, magH: 0.15, magCurve: 0.04, magMat: mats.black, stock: 0.22, rail: true, carry: true }),
  mp5: () => smg({ magH: 0.16 }),
  awp: () => sniper(),
  usp_s: () => pistol({ body: mats.gunLight, w: 1, slide: 0.22 }),
  glock18: () => pistol({ body: mats.black, w: 0.95, slide: 0.2 }),
  deagle: () => pistol({ body: mats.steel, w: 1.35, slide: 0.27 }),
  knife: () => knife(),
  smoke: () => grenade('smoke'),
  flash: () => grenade('flash'),
  he: () => grenade('he'),
};

export const MODEL_IDS = Object.keys(BUILDERS);

/** Builds a fresh model for a weapon id. Returns { group, muzzle, mag, adsY }. */
export function buildWeaponModel(id) {
  const build = BUILDERS[id] ?? BUILDERS.knife;
  const m = build();
  m.group.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } });
  m.magHome = m.mag ? m.mag.position.clone() : null;
  return m;
}

/** A simple character-weapon silhouette reused by bot models: id -> [length, thickness]. */
export const BOT_WEAPON_SIZE = {
  ak47: [0.85, 0.09], m4a4: [0.85, 0.09], mp5: [0.55, 0.08], awp: [1.2, 0.09],
  usp_s: [0.22, 0.12], glock18: [0.2, 0.12], deagle: [0.27, 0.14], knife: [0.3, 0.03],
  smoke: [0.12, 0.07], flash: [0.12, 0.07], he: [0.1, 0.09],
};
