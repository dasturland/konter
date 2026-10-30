// Small circular radar: teammates, bomb sites, the bomb and enemies that just fired.
import { MAP, SITES } from '@konter/shared';
import { h } from './dom.js';

const SIZE = 156;
const RANGE = 45; // meters from the centre to the edge
const SHOT_MEMORY_MS = 1400;

export class Radar {
  constructor() {
    this.canvas = h('canvas', { width: SIZE * 2, height: SIZE * 2 });
    this.element = h('div', { id: 'radar' }, this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.shots = new Map();
  }

  reset() {
    this.shots.clear();
  }

  /** Remember that a player fired so enemies show for a moment, like a real radar ping. */
  noteShot(id) {
    this.shots.set(id, performance.now());
  }

  /** Rotates world coordinates around the viewer so that "up" is where the player looks. */
  project(x, z, cx, cz, yaw) {
    const dx = x - cx;
    const dz = z - cz;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const right = dx * cos - dz * sin;
    const forward = -dx * sin - dz * cos;
    const s = (SIZE * 2) / 2 / RANGE;
    return [SIZE + right * s, SIZE - forward * s];
  }

  draw(snap, ctx) {
    const g = this.ctx;
    const me = ctx.me;
    const view = ctx.view;
    g.clearRect(0, 0, SIZE * 2, SIZE * 2);
    g.save();
    g.beginPath();
    g.arc(SIZE, SIZE, SIZE - 2, 0, Math.PI * 2);
    g.clip();

    // Walls as faint rectangles.
    g.fillStyle = 'rgba(255,255,255,0.16)';
    for (const b of MAP.boxes) {
      if (b.min[1] > 2 || b.max[1] < 0.5) continue;
      const [x0, y0] = this.project(b.min[0], b.min[2], view.x, view.z, ctx.yaw);
      const [x1, y1] = this.project(b.max[0], b.max[2], view.x, view.z, ctx.yaw);
      const pts = [this.project(b.min[0], b.min[2], view.x, view.z, ctx.yaw), this.project(b.max[0], b.min[2], view.x, view.z, ctx.yaw),
        this.project(b.max[0], b.max[2], view.x, view.z, ctx.yaw), this.project(b.min[0], b.max[2], view.x, view.z, ctx.yaw)];
      if (Math.min(x0, x1) > SIZE * 2 + 40 || Math.max(x0, x1) < -40 || Math.min(y0, y1) > SIZE * 2 + 40 || Math.max(y0, y1) < -40) continue;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
      g.fill();
    }

    g.font = '600 20px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const s of SITES) {
      const [x, y] = this.project(s.center[0], s.center[1], view.x, view.z, ctx.yaw);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillText(s.id, x, y);
    }

    const now = performance.now();
    for (const p of snap.players) {
      if (!p.alive || p.id === ctx.localId) continue;
      const mate = p.team === me.team;
      const recentlyShot = now - (this.shots.get(p.id) ?? -1e9) < SHOT_MEMORY_MS;
      if (!mate && !recentlyShot) continue;
      const [x, y] = this.project(p.x, p.z, view.x, view.z, ctx.yaw);
      g.fillStyle = mate ? (p.team === 'CT' ? '#3aa0ff' : '#ff9f1c') : '#ff3b4e';
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    }

    const bombPos = snap.bomb.pos ?? snap.bomb.dropped;
    if (bombPos) {
      const [x, y] = this.project(bombPos[0], bombPos[1], view.x, view.z, ctx.yaw);
      const pulse = snap.bomb.state === 'planted' && Math.floor(now / 300) % 2 === 0;
      g.fillStyle = pulse ? '#ffffff' : '#ff3b4e';
      g.fillRect(x - 6, y - 6, 12, 12);
    }

    // The viewer: a white arrow pointing up.
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(SIZE, SIZE - 10);
    g.lineTo(SIZE - 7, SIZE + 8);
    g.lineTo(SIZE + 7, SIZE + 8);
    g.closePath();
    g.fill();
    g.restore();
  }
}
