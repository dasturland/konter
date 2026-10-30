import { describe, it, expect } from 'vitest';
import { MAX_CLIENT_MESSAGE_BYTES } from '@konter/shared';
import {
  MAX_VIOLATIONS, TokenBucket, checkSize, clampMove, clampPosition, createGuard, maxTravel, payloadBytes,
} from './validation.js';

describe('size limit', () => {
  it('accepts small and rejects large payloads', () => {
    expect(checkSize('x'.repeat(100)).ok).toBe(true);
    const big = checkSize('x'.repeat(MAX_CLIENT_MESSAGE_BYTES + 1));
    expect(big.ok).toBe(false);
    expect(big.error).toBe('too_large');
    expect(checkSize(Buffer.alloc(5000)).ok).toBe(false);
    expect(payloadBytes('čč')).toBe(4);
    expect(payloadBytes(42)).toBe(Infinity);
  });
});

describe('TokenBucket', () => {
  it('refills over time', () => {
    let t = 0;
    const b = new TokenBucket(2, 2, () => t);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
    t = 500;
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
  });
});

describe('guard', () => {
  it('limits input rate and fire spam but allows 30 Hz play', () => {
    let t = 0;
    const g = createGuard(() => t);
    for (let i = 0; i < 90; i++) { t += 1000 / 30; expect(g.check('input').ok).toBe(true); }
    let blocked = 0;
    for (let i = 0; i < 100; i++) if (!g.check('input').ok) blocked += 1;
    expect(blocked).toBeGreaterThan(50);
    expect(g.violations).toBe(blocked);
  });

  it('limits chat separately', () => {
    let t = 0;
    const g = createGuard(() => t);
    let ok = 0;
    for (let i = 0; i < 10; i++) if (g.check('chat').ok) ok += 1;
    expect(ok).toBe(4);
    t += 2000;
    expect(g.check('chat').ok).toBe(true);
  });

  it('asks to close abusive connections', () => {
    const g = createGuard(() => 0);
    expect(g.shouldClose).toBe(false);
    for (let i = 0; i < MAX_VIOLATIONS; i++) g.violation();
    expect(g.shouldClose).toBe(true);
  });
});

describe('speed clamp', () => {
  it('normalizes oversized movement vectors', () => {
    const v = clampMove(3, 4);
    expect(Math.hypot(v.mx, v.mz)).toBeCloseTo(1, 5);
    expect(clampMove(0.3, 0.2)).toEqual({ mx: 0.3, mz: 0.2 });
    expect(clampMove(Infinity, 1)).toEqual({ mx: 0, mz: 0 });
  });

  it('limits travel distance', () => {
    expect(maxTravel(6, 1 / 30)).toBeCloseTo(0.21, 5);
    const p = clampPosition({ x: 0, z: 0 }, { x: 100, z: 0 }, 1);
    expect(p.x).toBeCloseTo(1, 5);
    expect(clampPosition({ x: 0, z: 0 }, { x: 0.5, z: 0 }, 1)).toEqual({ x: 0.5, z: 0 });
  });
});
