import { describe, it, expect } from 'vitest';
import {
  createBody, directionFromAngles, eyePosition, groundHeightAt, hasLineOfSight, isBlocked, movePlayer,
  normalize, raycast, rayBox, rayPlayer, rampHeightAt,
} from './collision.js';
import { MAP } from './map.js';

const dt = 1 / 30;

function box(kind, min, max) {
  return { kind, min, max };
}

const small = {
  boxes: [
    box('wall', [5, 0, -5], [6, 6, 5]),
    box('crate', [-2, 0, 2], [0, 1, 4]),
    box('platform', [10, 3.5, -2], [14, 4, 2]),
  ],
  ramps: [{ min: [20, -2], max: [30, 2], axis: 'x', y0: 0, y1: 4 }],
};

describe('AABB collision', () => {
  it('stops a player at a wall and slides along it', () => {
    const b = createBody(0, 0, 0);
    for (let i = 0; i < 60; i++) movePlayer(small, b, 0.3, 0.03, dt);
    expect(b.x).toBeLessThanOrEqual(5 - 0.4 + 1e-6);
    expect(b.x).toBeGreaterThan(4);
    expect(b.z).toBeGreaterThan(1);
  });

  it('does not tunnel through thin walls at high speed', () => {
    const b = createBody(0, 0, 0);
    movePlayer(small, b, 20, 0, dt);
    expect(b.x).toBeLessThan(5);
  });

  it('blocks crates but lets low steps through', () => {
    expect(isBlocked(small, -1, 0, 3)).toBe(true);
    const low = { boxes: [box('step', [0, 0, 0], [1, 0.4, 1])], ramps: [] };
    expect(isBlocked(low, 0.5, 0, 0.5)).toBe(false);
    expect(groundHeightAt(low, 0.5, 0.5, 0)).toBeCloseTo(0.4);
  });

  it('jumps and lands back on the ground', () => {
    const b = createBody(0, 0, 0);
    movePlayer(small, b, 0, 0, dt, 7);
    expect(b.onGround).toBe(false);
    let peak = 0;
    for (let i = 0; i < 60; i++) { movePlayer(small, b, 0, 0, dt); peak = Math.max(peak, b.y); }
    expect(peak).toBeGreaterThan(0.5);
    expect(b.onGround).toBe(true);
    expect(b.y).toBe(0);
  });

  it('can walk under a raised platform but not onto it directly', () => {
    expect(isBlocked(small, 12, 0, 0)).toBe(false);
    expect(groundHeightAt(small, 12, 0, 0)).toBe(0);
    expect(groundHeightAt(small, 12, 0, 3.6)).toBe(4);
  });

  it('walks up a ramp and follows its height', () => {
    const b = createBody(18, 0, 0);
    for (let i = 0; i < 75; i++) movePlayer(small, b, 0.15, 0, dt);
    expect(b.x).toBeGreaterThan(29);
    expect(b.y).toBeCloseTo(4, 0);
    expect(rampHeightAt(small.ramps[0], 25, 0)).toBeCloseTo(2);
  });

  it('cannot walk through the side of a ramp', () => {
    const b = createBody(25, 0, -4);
    for (let i = 0; i < 30; i++) movePlayer(small, b, 0, 0.15, dt);
    expect(b.z).toBeLessThan(-1.5);
  });

  it('is stopped by the real map walls', () => {
    const b = createBody(0, 0, -70);
    for (let i = 0; i < 120; i++) movePlayer(MAP, b, -0.2, 0, dt);
    expect(b.x).toBeGreaterThan(-60);
  });

  it('climbs the metal stairs of the real map', () => {
    const b = createBody(-33, 0, -2);
    for (let i = 0; i < 160; i++) movePlayer(MAP, b, 0, -0.1, dt);
    expect(b.y).toBeCloseTo(4, 1);
  });
});

describe('raycast', () => {
  it('hits a box at the right distance', () => {
    const hit = raycast(small, [0, 1, 0], [1, 0, 0], 100);
    expect(hit.distance).toBeCloseTo(5);
    expect(hit.kind).toBe('wall');
    expect(hit.point[0]).toBeCloseTo(5);
  });

  it('misses when pointing away or over', () => {
    expect(raycast(small, [0, 1, 0], [-1, 0, 0], 100)).toBe(null);
    expect(raycast(small, [0, 7, 0], [1, 0, 0], 100)).toBe(null);
    expect(raycast(small, [0, 1, 0], [1, 0, 0], 3)).toBe(null);
  });

  it('hits ramps from above', () => {
    const hit = raycast(small, [25, 10, 0], [0, -1, 0], 100);
    expect(hit.kind).toBe('ramp');
    expect(hit.point[1]).toBeCloseTo(2);
  });

  it('reports line of sight blocked by walls', () => {
    expect(hasLineOfSight(small, [0, 1, 0], [4, 1, 0])).toBe(true);
    expect(hasLineOfSight(small, [0, 1, 0], [8, 1, 0])).toBe(false);
    expect(hasLineOfSight(MAP, [0, 1.6, -80], [0, 1.6, 80])).toBe(false);
  });

  it('intersects player boxes and reports the hit height', () => {
    const body = createBody(0, 0, -10);
    const origin = eyePosition(createBody(0, 0, 0));
    const hit = rayPlayer(origin, [0, 0, -1], body, 50);
    expect(hit.distance).toBeCloseTo(9.6);
    expect(hit.hitY).toBeCloseTo(1.6);
    expect(rayPlayer(origin, [1, 0, 0], body, 50)).toBe(null);
  });

  it('builds view directions from yaw and pitch', () => {
    const d = directionFromAngles(0, 0);
    expect(d[2]).toBeCloseTo(-1);
    const up = directionFromAngles(0, Math.PI / 2);
    expect(up[1]).toBeCloseTo(1);
    expect(Math.hypot(...normalize([3, 4, 0]))).toBeCloseTo(1);
    expect(rayBox([0, 0, 0], [0, 1, 0], [1, 1, 1], [2, 2, 2], 10)).toBe(null);
  });
});
