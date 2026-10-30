import { describe, it, expect } from 'vitest';
import {
  applyArmor, applyDamage, classifyHitgroup, computeDamage, computeSplash, flashDuration, splashDamage,
} from './damage.js';
import { WEAPONS } from './weapons.js';

describe('damage', () => {
  it('multiplies headshots by 4', () => {
    const body = computeDamage({ weaponId: 'ak47', hitgroup: 'body', distance: 0, armor: 0 });
    const head = computeDamage({ weaponId: 'ak47', hitgroup: 'head', distance: 0, armor: 0 });
    expect(body.damage).toBe(36);
    expect(head.damage).toBe(144);
    expect(head.headshot).toBe(true);
  });

  it('reduces leg damage', () => {
    const legs = computeDamage({ weaponId: 'ak47', hitgroup: 'legs', distance: 0, armor: 0 });
    expect(legs.damage).toBe(27);
  });

  it('falls off with distance', () => {
    const near = computeDamage({ weaponId: 'mp5', hitgroup: 'body', distance: 2, armor: 0 }).damage;
    const far = computeDamage({ weaponId: 'mp5', hitgroup: 'body', distance: 40, armor: 0 }).damage;
    expect(far).toBeLessThan(near);
  });

  it('absorbs part of the damage with armor and wears it down', () => {
    const noArmor = computeDamage({ weaponId: 'm4a4', hitgroup: 'body', distance: 0, armor: 0 });
    const armored = computeDamage({ weaponId: 'm4a4', hitgroup: 'body', distance: 0, armor: 100 });
    expect(armored.damage).toBeLessThan(noArmor.damage);
    expect(armored.armorLoss).toBeGreaterThan(0);
  });

  it('spills damage to health when armor runs out', () => {
    const r = applyArmor(100, 2, 0.5);
    expect(r.armorLoss).toBe(2);
    expect(r.health).toBe(96);
  });

  it('armor-piercing weapons ignore most armor', () => {
    const awp = computeDamage({ weaponId: 'awp', hitgroup: 'body', distance: 0, armor: 100 });
    expect(awp.damage).toBeGreaterThanOrEqual(109);
  });

  it('ignores weapons without damage', () => {
    expect(computeDamage({ weaponId: 'smoke', hitgroup: 'body', distance: 0, armor: 0 }).damage).toBe(0);
    expect(computeDamage({ weaponId: 'nope', hitgroup: 'body', distance: 0, armor: 0 }).damage).toBe(0);
  });

  it('classifies hit heights', () => {
    expect(classifyHitgroup(1.7, 0)).toBe('head');
    expect(classifyHitgroup(1.0, 0)).toBe('body');
    expect(classifyHitgroup(0.3, 0)).toBe('legs');
    expect(classifyHitgroup(4.7, 4)).toBe('body');
  });

  it('applies damage to a player and reports kills', () => {
    const p = { health: 100, armor: 50 };
    expect(applyDamage(p, { damage: 60, armorLoss: 10 })).toBe(false);
    expect(p).toEqual({ health: 40, armor: 40 });
    expect(applyDamage(p, { damage: 60, armorLoss: 0 })).toBe(true);
    expect(p.health).toBe(0);
  });

  it('computes grenade splash falling off with distance', () => {
    expect(splashDamage('he', 0)).toBe(WEAPONS.he.damage);
    expect(splashDamage('he', 4.5)).toBeCloseTo(49, 0);
    expect(splashDamage('he', 9)).toBe(0);
    expect(computeSplash({ weaponId: 'he', distance: 20, armor: 0 }).damage).toBe(0);
    const armored = computeSplash({ weaponId: 'he', distance: 2, armor: 100 });
    const bare = computeSplash({ weaponId: 'he', distance: 2, armor: 0 });
    expect(armored.damage).toBeLessThan(bare.damage);
  });

  it('blinds longer when looking at the flash from close', () => {
    expect(flashDuration(3, 1)).toBeGreaterThan(flashDuration(20, 1));
    expect(flashDuration(3, 1)).toBeGreaterThan(flashDuration(3, 0));
    expect(flashDuration(3, -1)).toBe(0);
    expect(flashDuration(50, 1)).toBe(0);
  });
});

describe('weapons table', () => {
  it('has every required item with complete stats', () => {
    for (const id of ['usp_s', 'glock18', 'deagle', 'ak47', 'm4a4', 'mp5', 'awp', 'smoke', 'flash', 'he', 'armor', 'kit', 'knife']) {
      expect(WEAPONS[id]).toBeDefined();
    }
    for (const id of ['usp_s', 'glock18', 'deagle', 'ak47', 'm4a4', 'mp5', 'awp']) {
      const w = WEAPONS[id];
      expect(w.damage).toBeGreaterThan(0);
      expect(w.fireRate).toBeGreaterThan(0);
      expect(w.recoil.length).toBeGreaterThan(1);
      expect(w.spread.move).toBeGreaterThan(w.spread.stand);
      expect(w.mag).toBeGreaterThan(0);
      expect(w.reserve).toBeGreaterThan(0);
      expect(w.reload).toBeGreaterThan(0);
      expect(w.price).toBeGreaterThan(0);
    }
    expect(WEAPONS.awp.zoom.fov.length).toBe(2);
  });
});
