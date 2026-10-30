import { describe, it, expect } from 'vitest';
import { MAP, SITES, siteAt, spawnsFor, validateMap } from './map.js';
import { isBlocked } from './collision.js';

describe('bunker map', () => {
  it('passes its own validation', () => {
    expect(validateMap(MAP)).toEqual([]);
  });

  it('has five spawns per team outside geometry', () => {
    for (const team of ['CT', 'T']) {
      const spawns = spawnsFor(MAP, team);
      expect(spawns.length).toBe(5);
      for (const s of spawns) expect(isBlocked(MAP, s.x, s.y, s.z)).toBe(false);
    }
  });

  it('places CT in the south and T in the north', () => {
    expect(spawnsFor(MAP, 'CT')[0].z).toBeGreaterThan(60);
    expect(spawnsFor(MAP, 'T')[0].z).toBeLessThan(-60);
  });

  it('has sites A and B on open ground', () => {
    expect(SITES.map((s) => s.id)).toEqual(['A', 'B']);
    for (const s of SITES) {
      expect(siteAt(MAP, s.center[0], s.center[1])).toBe(s);
      expect(isBlocked(MAP, s.center[0], 0, s.center[1])).toBe(false);
    }
    expect(siteAt(MAP, 0, 0)).toBe(null);
  });

  it('contains the requested structure kinds and props', () => {
    const kinds = new Set(MAP.boxes.map((b) => b.kind));
    for (const k of ['wall', 'crate', 'barrel', 'pillar', 'stairs', 'platform']) expect(kinds.has(k)).toBe(true);
    expect(MAP.ramps.length).toBeGreaterThan(0);
    const props = new Set(MAP.props.map((p) => p.type));
    for (const p of ['lamp', 'vent', 'pipe', 'terminal', 'hazard_stripe']) expect(props.has(p)).toBe(true);
  });

  it('is large', () => {
    expect(MAP.bounds.max[0] - MAP.bounds.min[0]).toBeGreaterThanOrEqual(100);
    expect(MAP.bounds.max[1] - MAP.bounds.min[1]).toBeGreaterThanOrEqual(150);
  });

  it('detects invalid data', () => {
    const broken = { ...MAP, boxes: [...MAP.boxes, { kind: 'crate', min: [-9, 0, 76], max: [-7, 2, 80] }] };
    expect(validateMap(broken).length).toBeGreaterThan(0);
  });
});
