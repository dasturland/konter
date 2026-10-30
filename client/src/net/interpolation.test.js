import { describe, it, expect } from 'vitest';
import { SnapshotBuffer, blend } from './interpolation.js';

function snap(tick, x, yaw = 0) {
  return { tick, players: [{ id: 'a', alive: true, x, y: 0, z: 0, yaw, pitch: 0, health: 100 }] };
}

describe('SnapshotBuffer', () => {
  it('returns null when empty and the only snapshot when single', () => {
    const b = new SnapshotBuffer();
    expect(b.sample(0)).toBe(null);
    b.push(snap(1, 0), 0);
    expect(b.sample(500).tick).toBe(1);
  });

  it('interpolates positions 100 ms in the past', () => {
    const b = new SnapshotBuffer(100);
    b.push(snap(1, 0), 1000);
    b.push(snap(2, 4), 1100);
    const s = b.sample(1150);
    expect(s.players[0].x).toBeCloseTo(2, 5);
  });

  it('holds the newest snapshot when the buffer runs dry', () => {
    const b = new SnapshotBuffer(100);
    b.push(snap(1, 0), 1000);
    b.push(snap(2, 4), 1100);
    expect(b.sample(2000).players[0].x).toBe(4);
  });

  it('ignores old or duplicate ticks', () => {
    const b = new SnapshotBuffer();
    b.push(snap(5, 1), 0);
    b.push(snap(4, 2), 10);
    b.push(snap(5, 3), 20);
    expect(b.items).toHaveLength(1);
  });

  it('does not interpolate teleports and takes the short way round for angles', () => {
    const far = blend(snap(1, 0), snap(2, 50), 0.5);
    expect(far.players[0].x).toBe(50);
    const turn = blend(snap(1, 0, 3.0), snap(2, 0, -3.0), 0.5);
    expect(Math.abs(Math.abs(turn.players[0].yaw) - Math.PI)).toBeLessThan(0.2);
  });
});
