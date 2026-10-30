// Client side prediction. The local body is stepped with the same movement code as the server
// (movePlayer from the shared module). When a snapshot arrives the body is reset to the
// authoritative state and the inputs the server has not processed yet are replayed.
import {
  MAP, RUN_SPEED, WALK_SPEED, JUMP_SPEED, TICK_DT, createBody, getWeapon, movePlayer,
} from '@konter/shared';

/** Offsets larger than this are snapped instead of smoothed. */
export const SNAP_DISTANCE = 3;
const SMOOTH_RATE = 10;

/** Horizontal displacement and jump speed for one command. Mirrors GameSim.stepPlayer. */
export function stepBody(body, cmd, ctx, dt = TICK_DT) {
  const weapon = getWeapon(ctx.weapon) ?? getWeapon('knife');
  let mx = Number.isFinite(cmd.mx) ? cmd.mx : 0;
  let mz = Number.isFinite(cmd.mz) ? cmd.mz : 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  let speed = (cmd.walk ? WALK_SPEED : RUN_SPEED) * weapon.moveSpeed;
  if (cmd.scope && weapon.zoom) speed *= weapon.zoom.moveSpeed;
  let dx = 0;
  let dz = 0;
  if (ctx.moveAllowed && !ctx.frozen) {
    const sin = Math.sin(cmd.yaw);
    const cos = Math.cos(cmd.yaw);
    dx = (-sin * mz + cos * mx) * speed * dt;
    dz = (-cos * mz - sin * mx) * speed * dt;
  }
  const jump = ctx.moveAllowed && cmd.jump ? JUMP_SPEED : 0;
  movePlayer(MAP, body, dx, dz, dt, jump);
}

export class Predictor {
  constructor() {
    this.body = createBody(0, 0, 0);
    this.pending = [];
    this.error = { x: 0, y: 0, z: 0 };
    this.initialized = false;
    this.ctx = { weapon: 'knife', moveAllowed: false, frozen: false };
  }

  reset() {
    this.pending.length = 0;
    this.error = { x: 0, y: 0, z: 0 };
    this.initialized = false;
  }

  /** Context that depends on the latest authoritative state (weapon, phase, bomb actions). */
  setContext(ctx) {
    this.ctx = ctx;
  }

  /** Applies a freshly built command locally and remembers it until the server confirms it. */
  apply(cmd) {
    if (!this.initialized) return;
    stepBody(this.body, cmd, this.ctx);
    this.pending.push({ cmd, ctx: this.ctx });
    if (this.pending.length > 120) this.pending.shift();
  }

  /** Reconciles with the authoritative player state from a snapshot. */
  reconcile(me) {
    const before = this.position();
    this.body.x = me.x;
    this.body.y = me.y;
    this.body.z = me.z;
    this.body.vy = me.vy;
    this.body.onGround = me.ground;
    this.pending = this.pending.filter((p) => p.cmd.seq > me.seq);
    if (!me.alive) this.pending.length = 0;
    for (const p of this.pending) stepBody(this.body, p.cmd, p.ctx);
    if (!this.initialized) {
      this.initialized = true;
      this.error = { x: 0, y: 0, z: 0 };
      return;
    }
    const ex = before.x - this.body.x;
    const ey = before.y - this.body.y;
    const ez = before.z - this.body.z;
    if (Math.hypot(ex, ey, ez) > SNAP_DISTANCE) {
      this.error = { x: 0, y: 0, z: 0 };
    } else {
      this.error = { x: ex, y: ey, z: ez };
    }
  }

  /** Decays the visual correction so small mispredictions slide away instead of popping. */
  smooth(dt) {
    const k = Math.exp(-SMOOTH_RATE * dt);
    this.error.x *= k;
    this.error.y *= k;
    this.error.z *= k;
  }

  /** Position to render the local camera at. */
  position() {
    return { x: this.body.x + this.error.x, y: this.body.y + this.error.y, z: this.body.z + this.error.z };
  }
}
