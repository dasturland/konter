// Snapshot interpolation: remote entities are drawn about 100 ms in the past so there are always
// two snapshots to blend between, which hides network jitter.
export const INTERPOLATION_DELAY_MS = 100;
const MAX_BUFFER = 40;

function lerp(a, b, k) {
  return a + (b - a) * k;
}

function lerpAngle(a, b, k) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class SnapshotBuffer {
  constructor(delayMs = INTERPOLATION_DELAY_MS) {
    this.delayMs = delayMs;
    this.items = [];
  }

  clear() {
    this.items.length = 0;
  }

  get latest() {
    return this.items.length ? this.items[this.items.length - 1].snap : null;
  }

  /** Stores a snapshot with its arrival time in milliseconds. */
  push(snap, now) {
    const last = this.items[this.items.length - 1];
    if (last && snap.tick <= last.snap.tick) return;
    this.items.push({ t: now, snap });
    while (this.items.length > MAX_BUFFER) this.items.shift();
  }

  /**
   * Returns the world as it was `delayMs` before `now`. Positions and angles are blended,
   * discrete state (health, weapon, alive) comes from the newer of the two snapshots.
   */
  sample(now) {
    const items = this.items;
    if (items.length === 0) return null;
    if (items.length === 1) return items[0].snap;
    const target = now - this.delayMs;
    if (target <= items[0].t) return items[0].snap;
    const newest = items[items.length - 1];
    if (target >= newest.t) return newest.snap;
    let i = items.length - 2;
    while (i > 0 && items[i].t > target) i--;
    const a = items[i];
    const b = items[i + 1];
    const k = (target - a.t) / Math.max(1, b.t - a.t);
    return blend(a.snap, b.snap, k);
  }
}

/** Blends two snapshots. Players that teleported (respawn) are not interpolated. */
export function blend(a, b, k) {
  const before = new Map(a.players.map((p) => [p.id, p]));
  const players = b.players.map((p) => {
    const q = before.get(p.id);
    if (!q || !q.alive || !p.alive) return p;
    const jump = Math.abs(p.x - q.x) + Math.abs(p.z - q.z);
    if (jump > 6) return p;
    return {
      ...p,
      x: lerp(q.x, p.x, k),
      y: lerp(q.y, p.y, k),
      z: lerp(q.z, p.z, k),
      yaw: lerpAngle(q.yaw, p.yaw, k),
      pitch: lerp(q.pitch, p.pitch, k),
    };
  });
  return { ...b, players };
}
