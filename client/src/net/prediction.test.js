import { describe, it, expect } from 'vitest';
import { SPAWNS, TICK_DT, RUN_SPEED } from '@konter/shared';
import { Predictor, stepBody } from './prediction.js';
import { createBody } from '@konter/shared';

const spawn = SPAWNS.CT[2];
const ctx = { weapon: 'knife', moveAllowed: true, frozen: false };

function cmd(seq, extra = {}) {
  return { seq, mx: 0, mz: 1, yaw: 0, pitch: 0, jump: false, walk: false, scope: false, ...extra };
}

function server(x, z, seq) {
  return { x, y: 0, z, vy: 0, ground: true, seq, alive: true };
}

describe('stepBody', () => {
  it('moves forward at run speed and not while frozen or in freeze time', () => {
    const body = createBody(spawn.x, 0, spawn.z);
    stepBody(body, cmd(1), ctx);
    expect(spawn.z - body.z).toBeCloseTo(RUN_SPEED * TICK_DT, 3);
    const still = createBody(spawn.x, 0, spawn.z);
    stepBody(still, cmd(1), { ...ctx, moveAllowed: false });
    expect(still.z).toBe(spawn.z);
    stepBody(still, cmd(2), { ...ctx, frozen: true });
    expect(still.z).toBe(spawn.z);
  });
});

describe('Predictor', () => {
  it('replays unacknowledged commands after reconciliation', () => {
    const p = new Predictor();
    p.setContext(ctx);
    p.reconcile(server(spawn.x, spawn.z, 0));
    for (let i = 1; i <= 5; i++) p.apply(cmd(i));
    const predicted = p.body.z;
    // The server confirmed three of the five inputs at exactly the predicted places.
    const ref = createBody(spawn.x, 0, spawn.z);
    for (let i = 1; i <= 3; i++) stepBody(ref, cmd(i), ctx);
    p.reconcile(server(ref.x, ref.z, 3));
    expect(p.pending).toHaveLength(2);
    expect(p.body.z).toBeCloseTo(predicted, 5);
    expect(Math.hypot(p.error.x, p.error.z)).toBeLessThan(1e-6);
  });

  it('corrects mispredictions smoothly and snaps large errors', () => {
    const p = new Predictor();
    p.setContext(ctx);
    p.reconcile(server(spawn.x, spawn.z, 0));
    p.apply(cmd(1));
    p.reconcile(server(spawn.x + 0.5, spawn.z, 1));
    expect(Math.abs(p.error.x)).toBeGreaterThan(0.4);
    const first = Math.abs(p.position().x - p.body.x);
    p.smooth(0.2);
    expect(Math.abs(p.position().x - p.body.x)).toBeLessThan(first);
    p.reconcile(server(spawn.x + 20, spawn.z, 1));
    expect(p.error.x).toBe(0);
  });
});
