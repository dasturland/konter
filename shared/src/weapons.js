// Weapons and equipment table. Pure data plus a few lookup helpers.
import { TEAM_CT, TEAM_T } from './constants.js';

export const CATEGORY_PISTOL = 'pistol';
export const CATEGORY_RIFLE = 'rifle';
export const CATEGORY_SMG = 'smg';
export const CATEGORY_SNIPER = 'sniper';
export const CATEGORY_GRENADE = 'grenade';
export const CATEGORY_KNIFE = 'knife';
export const CATEGORY_EQUIPMENT = 'equipment';

/**
 * Deterministic recoil pattern: one [pitchDeg, yawDeg] kick per consecutive shot.
 * Pitch climbs quickly and then levels off; yaw sways left and right.
 */
function makeRecoilPattern(shots, climb, sway, levelAfter) {
  const pattern = [];
  for (let i = 0; i < shots; i++) {
    const pitch = i < levelAfter ? climb : climb * 0.25;
    const yaw = Math.round(Math.sin(i * 1.7 + 0.6) * sway * 1000) / 1000;
    pattern.push([Math.round(pitch * 1000) / 1000, yaw]);
  }
  return pattern;
}

const NO_RECOIL = [[0, 0]];

/** Spread is in radians: standing, crouch-walking/walking, running and airborne. */
function spread(stand, walk, run, air) {
  return { stand, walk, move: run, air };
}

const defs = [
  {
    id: 'knife', name: 'Pichoq', category: CATEGORY_KNIFE, slot: 'knife', team: 'both',
    price: 0, killReward: 1500, damage: 40, fireRate: 1.5, auto: false,
    mag: 0, reserve: 0, reload: 0, recoil: NO_RECOIL, spread: spread(0, 0, 0, 0),
    rangeModifier: 1, armorPen: 0.85, range: 2.2, moveSpeed: 1.0, drawTime: 0.5,
  },
  {
    id: 'usp_s', name: 'USP-S', category: CATEGORY_PISTOL, slot: 'secondary', team: TEAM_CT,
    price: 200, killReward: 300, damage: 35, fireRate: 6.5, auto: false,
    mag: 12, reserve: 24, reload: 2.2, recoil: makeRecoilPattern(12, 0.55, 0.12, 4),
    spread: spread(0.003, 0.012, 0.03, 0.06), rangeModifier: 0.91, armorPen: 0.5,
    moveSpeed: 1.0, drawTime: 0.6,
  },
  {
    id: 'glock18', name: 'Glock-18', category: CATEGORY_PISTOL, slot: 'secondary', team: TEAM_T,
    price: 200, killReward: 300, damage: 28, fireRate: 8, auto: false,
    mag: 20, reserve: 120, reload: 2.2, recoil: makeRecoilPattern(20, 0.5, 0.14, 5),
    spread: spread(0.004, 0.014, 0.034, 0.065), rangeModifier: 0.9, armorPen: 0.47,
    moveSpeed: 1.0, drawTime: 0.6,
  },
  {
    id: 'deagle', name: 'Desert Eagle', category: CATEGORY_PISTOL, slot: 'secondary', team: 'both',
    price: 700, killReward: 300, damage: 53, fireRate: 2.2, auto: false,
    mag: 7, reserve: 35, reload: 2.2, recoil: makeRecoilPattern(7, 1.9, 0.25, 7),
    spread: spread(0.004, 0.02, 0.05, 0.09), rangeModifier: 0.93, armorPen: 0.93,
    moveSpeed: 0.95, drawTime: 0.7,
  },
  {
    id: 'ak47', name: 'AK-47', category: CATEGORY_RIFLE, slot: 'primary', team: TEAM_T,
    price: 2700, killReward: 300, damage: 36, fireRate: 10, auto: true,
    mag: 30, reserve: 90, reload: 2.5, recoil: makeRecoilPattern(30, 0.95, 0.35, 9),
    spread: spread(0.004, 0.02, 0.06, 0.1), rangeModifier: 0.98, armorPen: 0.775,
    moveSpeed: 0.9, drawTime: 0.9,
  },
  {
    id: 'm4a4', name: 'M4A4', category: CATEGORY_RIFLE, slot: 'primary', team: TEAM_CT,
    price: 3100, killReward: 300, damage: 33, fireRate: 11, auto: true,
    mag: 30, reserve: 90, reload: 3.1, recoil: makeRecoilPattern(30, 0.8, 0.3, 9),
    spread: spread(0.0035, 0.018, 0.055, 0.1), rangeModifier: 0.97, armorPen: 0.7,
    moveSpeed: 0.92, drawTime: 0.9,
  },
  {
    id: 'mp5', name: 'MP5', category: CATEGORY_SMG, slot: 'primary', team: 'both',
    price: 1500, killReward: 600, damage: 26, fireRate: 12, auto: true,
    mag: 30, reserve: 120, reload: 2.6, recoil: makeRecoilPattern(30, 0.6, 0.28, 8),
    spread: spread(0.005, 0.016, 0.04, 0.09), rangeModifier: 0.84, armorPen: 0.625,
    moveSpeed: 1.0, drawTime: 0.8,
  },
  {
    id: 'awp', name: 'AWP', category: CATEGORY_SNIPER, slot: 'primary', team: 'both',
    price: 4750, killReward: 100, damage: 115, fireRate: 0.75, auto: false,
    mag: 5, reserve: 30, reload: 3.6, recoil: makeRecoilPattern(5, 2.4, 0.1, 5),
    spread: spread(0.02, 0.06, 0.12, 0.2), rangeModifier: 0.99, armorPen: 0.95,
    moveSpeed: 0.78, drawTime: 1.2,
    // Scoped shots are pin-point accurate while standing still.
    zoom: { fov: [40, 15], scopedSpread: spread(0, 0.01, 0.05, 0.1), moveSpeed: 0.6 },
  },
  {
    id: 'smoke', name: 'Tutun granatasi', category: CATEGORY_GRENADE, slot: 'grenade', team: 'both',
    price: 300, killReward: 300, damage: 0, fireRate: 1, auto: false,
    mag: 1, reserve: 0, reload: 0, recoil: NO_RECOIL, spread: spread(0, 0, 0, 0),
    rangeModifier: 1, armorPen: 0, moveSpeed: 0.95, drawTime: 0.5,
    fuse: 1.5, effectDuration: 18, radius: 5, maxCarry: 1, throwSpeed: 18,
  },
  {
    id: 'flash', name: 'Yorug\'lik granatasi', category: CATEGORY_GRENADE, slot: 'grenade', team: 'both',
    price: 200, killReward: 300, damage: 0, fireRate: 1, auto: false,
    mag: 1, reserve: 0, reload: 0, recoil: NO_RECOIL, spread: spread(0, 0, 0, 0),
    rangeModifier: 1, armorPen: 0, moveSpeed: 0.95, drawTime: 0.5,
    fuse: 1.6, effectDuration: 3.5, radius: 30, maxCarry: 2, throwSpeed: 18,
  },
  {
    id: 'he', name: 'Portlovchi granata', category: CATEGORY_GRENADE, slot: 'grenade', team: 'both',
    price: 300, killReward: 300, damage: 98, fireRate: 1, auto: false,
    mag: 1, reserve: 0, reload: 0, recoil: NO_RECOIL, spread: spread(0, 0, 0, 0),
    rangeModifier: 1, armorPen: 0.5, moveSpeed: 0.95, drawTime: 0.5,
    fuse: 1.6, effectDuration: 0, radius: 9, maxCarry: 1, throwSpeed: 18,
  },
  {
    id: 'armor', name: 'Zirh', category: CATEGORY_EQUIPMENT, slot: 'armor', team: 'both',
    price: 650, killReward: 0, damage: 0, fireRate: 0, auto: false,
    mag: 0, reserve: 0, reload: 0, recoil: NO_RECOIL, spread: spread(0, 0, 0, 0),
    rangeModifier: 1, armorPen: 0, moveSpeed: 1, drawTime: 0, armorValue: 100,
  },
  {
    id: 'kit', name: 'Zararsizlantirish to\'plami', category: CATEGORY_EQUIPMENT, slot: 'kit', team: TEAM_CT,
    price: 400, killReward: 0, damage: 0, fireRate: 0, auto: false,
    mag: 0, reserve: 0, reload: 0, recoil: NO_RECOIL, spread: spread(0, 0, 0, 0),
    rangeModifier: 1, armorPen: 0, moveSpeed: 1, drawTime: 0,
  },
];

export const WEAPONS = Object.freeze(Object.fromEntries(defs.map((d) => [d.id, Object.freeze(d)])));
export const WEAPON_IDS = Object.freeze(defs.map((d) => d.id));

export function getWeapon(id) {
  return Object.prototype.hasOwnProperty.call(WEAPONS, id) ? WEAPONS[id] : null;
}

export function isWeaponId(id) {
  return typeof id === 'string' && getWeapon(id) !== null;
}

/** True when the item can be used by the given team. */
export function isAllowedForTeam(id, team) {
  const w = getWeapon(id);
  return w !== null && (w.team === 'both' || w.team === team);
}

/** Items shown in the buy menu for a team, in table order, excluding the knife. */
export function buyList(team) {
  return defs.filter((d) => d.id !== 'knife' && (d.team === 'both' || d.team === team));
}

/** Seconds between two consecutive shots. */
export function shotInterval(id) {
  const w = getWeapon(id);
  return w && w.fireRate > 0 ? 1 / w.fireRate : Infinity;
}

/** Recoil kick for the n-th consecutive shot (clamped to the end of the pattern). */
export function recoilAt(id, shotIndex) {
  const w = getWeapon(id);
  if (!w) return [0, 0];
  const i = Math.max(0, Math.min(shotIndex, w.recoil.length - 1));
  return w.recoil[i];
}

/** Current spread (radians) for a movement state: 'stand', 'walk', 'move' or 'air'. */
export function spreadFor(id, state, scoped = false) {
  const w = getWeapon(id);
  if (!w) return 0;
  const table = scoped && w.zoom ? w.zoom.scopedSpread : w.spread;
  return table[state] ?? table.stand;
}

export function startingSecondary(team) {
  return team === TEAM_CT ? 'usp_s' : 'glock18';
}
