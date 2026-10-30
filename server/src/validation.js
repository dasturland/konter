// Per-connection protection: message size, rate limits and movement clamping.
import { ERROR_CODES, MAX_CLIENT_MESSAGE_BYTES, C2S } from '@konter/shared';

/** Token bucket: `rate` tokens per second up to `burst`. */
export class TokenBucket {
  constructor(rate, burst, now = Date.now) {
    this.rate = rate;
    this.burst = burst;
    this.now = now;
    this.tokens = burst;
    this.last = now();
  }

  take() {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.rate);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Limits per message type: sustained rate per second and burst size. */
export const RATE_LIMITS = Object.freeze({
  [C2S.INPUT]: { rate: 45, burst: 15 },
  [C2S.CHAT]: { rate: 1, burst: 4 },
  [C2S.BUY]: { rate: 5, burst: 10 },
  [C2S.READY]: { rate: 2, burst: 4 },
  [C2S.HOST]: { rate: 5, burst: 10 },
  [C2S.JOIN]: { rate: 0.5, burst: 3 },
  [C2S.LEAVE]: { rate: 1, burst: 3 },
  [C2S.PING]: { rate: 2, burst: 4 },
  [C2S.TEAM]: { rate: 2, burst: 4 },
});
export const GLOBAL_LIMIT = Object.freeze({ rate: 120, burst: 60 });
/** A connection that breaks the rules this many times is dropped. */
export const MAX_VIOLATIONS = 60;

/** Byte size of a raw ws payload (string, Buffer or ArrayBuffer-like). */
export function payloadBytes(raw) {
  if (typeof raw === 'string') return Buffer.byteLength(raw, 'utf8');
  if (raw && typeof raw.length === 'number') return raw.length;
  if (raw && typeof raw.byteLength === 'number') return raw.byteLength;
  return Infinity;
}

export function checkSize(raw, maxBytes = MAX_CLIENT_MESSAGE_BYTES) {
  return payloadBytes(raw) <= maxBytes ? { ok: true } : { ok: false, error: ERROR_CODES.TOO_LARGE };
}

export function createGuard(now = Date.now) {
  const global = new TokenBucket(GLOBAL_LIMIT.rate, GLOBAL_LIMIT.burst, now);
  const buckets = new Map();
  let violations = 0;
  return {
    /** Checks the rate limit for a message type. */
    check(type) {
      let ok = global.take();
      const limit = RATE_LIMITS[type];
      if (limit) {
        let bucket = buckets.get(type);
        if (!bucket) { bucket = new TokenBucket(limit.rate, limit.burst, now); buckets.set(type, bucket); }
        ok = bucket.take() && ok;
      }
      if (!ok) { violations += 1; return { ok: false, error: ERROR_CODES.RATE_LIMIT }; }
      return { ok: true };
    },
    violation() {
      violations += 1;
      return violations;
    },
    get violations() { return violations; },
    get shouldClose() { return violations >= MAX_VIOLATIONS; },
  };
}

/** Clamps a movement vector to unit length so diagonal or oversized input cannot exceed speed. */
export function clampMove(mx, mz) {
  const len = Math.hypot(mx, mz);
  if (!Number.isFinite(len)) return { mx: 0, mz: 0 };
  if (len <= 1) return { mx, mz };
  return { mx: mx / len, mz: mz / len };
}

/**
 * Maximum horizontal distance a player may cover in dt seconds at the given top speed.
 * A small tolerance absorbs floating point error and slope steps.
 */
export function maxTravel(speed, dt, tolerance = 1.05) {
  return speed * dt * tolerance;
}

/** Limits how far a claimed position may be from the server position (anti teleport). */
export function clampPosition(server, claimed, maxDistance) {
  const dx = claimed.x - server.x;
  const dz = claimed.z - server.z;
  const d = Math.hypot(dx, dz);
  if (!Number.isFinite(d)) return { x: server.x, z: server.z };
  if (d <= maxDistance) return { x: claimed.x, z: claimed.z };
  const k = maxDistance / d;
  return { x: server.x + dx * k, z: server.z + dz * k };
}
