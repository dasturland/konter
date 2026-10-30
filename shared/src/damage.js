// Damage computation: hitgroups, headshot multiplier, armor absorption, range falloff, splash.
import { HEADSHOT_MULTIPLIER, PLAYER_HEIGHT } from './constants.js';
import { getWeapon } from './weapons.js';

export const HITGROUP_HEAD = 'head';
export const HITGROUP_BODY = 'body';
export const HITGROUP_LEGS = 'legs';

export const HITGROUP_MULTIPLIERS = {
  head: HEADSHOT_MULTIPLIER,
  body: 1,
  legs: 0.75,
};

/** Distance (meters) over which rangeModifier is applied once. */
export const FALLOFF_UNIT = 12.7;
/** Armor points lost per absorbed damage point. */
export const ARMOR_COST_RATIO = 0.5;

/** Classifies a hit by its height above the feet of a standing player. */
export function classifyHitgroup(hitY, feetY, height = PLAYER_HEIGHT) {
  const ratio = (hitY - feetY) / height;
  if (ratio >= 0.84) return HITGROUP_HEAD;
  if (ratio < 0.36) return HITGROUP_LEGS;
  return HITGROUP_BODY;
}

/** Applies armor to raw damage. Returns integer health and armor changes. */
export function applyArmor(rawDamage, armor, armorPen) {
  if (armor <= 0 || armorPen >= 1) {
    return { health: Math.max(1, Math.round(rawDamage)), armorLoss: 0 };
  }
  const absorbedWanted = rawDamage * (1 - armorPen);
  let armorLoss = absorbedWanted * ARMOR_COST_RATIO;
  let absorbed = absorbedWanted;
  if (armorLoss > armor) {
    armorLoss = armor;
    absorbed = armorLoss / ARMOR_COST_RATIO;
  }
  return {
    health: Math.max(1, Math.round(rawDamage - absorbed)),
    armorLoss: Math.round(armorLoss),
  };
}

/**
 * Damage dealt by a bullet.
 * @param {{weaponId:string, hitgroup:string, distance:number, armor:number}} hit
 * @returns {{damage:number, armorLoss:number, headshot:boolean}} damage is health lost
 */
export function computeDamage({ weaponId, hitgroup, distance, armor }) {
  const w = getWeapon(weaponId);
  if (!w || w.damage <= 0) return { damage: 0, armorLoss: 0, headshot: false };
  const falloff = Math.pow(w.rangeModifier, Math.max(0, distance) / FALLOFF_UNIT);
  const mult = HITGROUP_MULTIPLIERS[hitgroup] ?? 1;
  const raw = w.damage * falloff * mult;
  const { health, armorLoss } = applyArmor(raw, armor, w.armorPen);
  return { damage: health, armorLoss, headshot: hitgroup === HITGROUP_HEAD };
}

/** Raw HE grenade damage at a distance from the blast center; 0 outside the radius. */
export function splashDamage(weaponId, distance) {
  const w = getWeapon(weaponId);
  if (!w || w.damage <= 0 || distance >= w.radius) return 0;
  return w.damage * (1 - distance / w.radius);
}

/** Splash hit including armor. */
export function computeSplash({ weaponId, distance, armor }) {
  const raw = splashDamage(weaponId, distance);
  if (raw <= 0) return { damage: 0, armorLoss: 0 };
  const w = getWeapon(weaponId);
  const { health, armorLoss } = applyArmor(raw, armor, w.armorPen);
  return { damage: health, armorLoss };
}

/** Flash blind duration in seconds based on distance and view alignment (dot 1 = looking at it). */
export function flashDuration(distance, lookDot) {
  const w = getWeapon('flash');
  if (distance >= w.radius || lookDot <= -0.2) return 0;
  const distanceFactor = 1 - distance / w.radius;
  const viewFactor = lookDot > 0.5 ? 1 : 0.35 + (Math.max(lookDot, -0.2) + 0.2) * 0.93;
  return Math.round(w.effectDuration * distanceFactor * viewFactor * 100) / 100;
}

/** Applies a damage result to a player object {health, armor}; returns true when it kills. */
export function applyDamage(target, result) {
  target.health = Math.max(0, target.health - result.damage);
  target.armor = Math.max(0, target.armor - result.armorLoss);
  return target.health <= 0;
}
