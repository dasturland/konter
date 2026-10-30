// Game level audio: turns simulation events and snapshot motion into positional sounds.
import { MAP, hasLineOfSight, SITES } from '@konter/shared';
import { AudioEngine } from './engine.js';
import { RECIPES } from './sounds.js';

const HEAR_RANGE = 70;
const STEP_DISTANCE = 2.1;
const RUN_THRESHOLD = 4.4;
const EYE = 1.6;

export class GameAudio {
  constructor(settings) {
    this.engine = new AudioEngine(settings);
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.tracks = new Map();
    this.beepTimer = 0;
    this.localId = null;
    this.localTeam = null;
    this.prevReloading = false;
    this.dryCooldown = 0;
    this.bombPlanted = false;
  }

  /** Call from a user gesture (click or key) so the browser lets audio start. */
  unlock() {
    return this.engine.unlock();
  }

  toggleMute() {
    return this.engine.toggleMute();
  }

  get muted() {
    return this.engine.muted;
  }

  reset(localId) {
    this.localId = localId;
    this.tracks.clear();
    this.beepTimer = 0;
    this.prevReloading = false;
    this.bombPlanted = false;
  }

  /** Plays a recipe. `pos` makes it 3D, lowpassed when a wall is between the sound and the listener. */
  play(name, arg = null, pos = null, reverb = 0.25) {
    const eng = this.engine;
    if (!eng.ready || eng.ctx.state !== 'running') return;
    const recipe = RECIPES[name];
    if (!recipe) return;
    let occluded = false;
    if (pos) {
      const d = Math.hypot(pos[0] - this.listener.x, pos[2] - this.listener.z);
      if (d > HEAR_RANGE) return;
      const from = [this.listener.x, this.listener.y + EYE, this.listener.z];
      occluded = !hasLineOfSight(MAP, from, [pos[0], pos[1] + 1.2, pos[2]]);
    }
    recipe(eng, eng.route({ pos, occluded, reverb }), arg);
  }

  /** Non-positional interface sound. */
  ui(name, arg = null) {
    this.play(name, arg, null, 0);
  }

  isLocal(id) {
    return id === this.localId;
  }

  /** Processes simulation events. `players` is the current snapshot player list. */
  handleEvents(events, players) {
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          if (this.isLocal(e.player)) this.play('shot', e.weapon, null, 0.35);
          else this.play('shot', e.weapon, [e.x, e.y, e.z], 0.5);
          break;
        case 'hit': {
          const v = byId.get(e.victim);
          if (this.isLocal(e.victim)) this.play('hurt', null, null, 0.1);
          else if (v) this.play(e.headshot ? 'headshot' : 'hit', null, [v.x, v.y + 1.2, v.z], 0.1);
          if (this.isLocal(e.attacker)) this.play('hitMarker', e.headshot, null, 0);
          break;
        }
        case 'kill': {
          const v = byId.get(e.victim);
          if (v) this.play('death', null, this.isLocal(e.victim) ? null : [v.x, v.y + 1, v.z], 0.4);
          break;
        }
        case 'grenade':
          if (e.kind === 'he') this.play('explosion', false, [e.x, e.y, e.z], 0.6);
          else if (e.kind === 'flash') this.play('flashBang', null, [e.x, e.y, e.z], 0.4);
          else this.play('smokePop', null, [e.x, e.y, e.z], 0.4);
          break;
        case 'planted': this.play('plant', null, this.sitePos(e.site), 0.4); this.bombPlanted = true; break;
        case 'defused': this.play('defuse', null, this.sitePos(e.site), 0.4); this.bombPlanted = false; break;
        case 'exploded': this.play('explosion', true, this.sitePos(e.site), 0.8); this.bombPlanted = false; break;
        case 'round_start': this.play('roundSignal', null, null, 0.2); this.bombPlanted = false; break;
        case 'live': this.play('roundLive', null, null, 0.1); break;
        case 'round_end': this.play(e.winner === this.localTeam ? 'win' : 'lose', null, null, 0.2); break;
        case 'pickup': if (this.isLocal(e.player)) this.play('pickup', null, null, 0); break;
        default: break;
      }
    }
  }

  sitePos(siteId) {
    const s = SITES.find((x) => x.id === siteId) ?? SITES[0];
    return [s.center[0], 0.5, s.center[1]];
  }

  /**
   * Per-frame update: listener, footsteps, jump and land sounds, reload, bomb beeps.
   * @param {object} snap latest snapshot
   * @param {{x:number,y:number,z:number}} view local view position
   */
  update(dt, snap, view, yaw, localState, firing) {
    this.listener = { x: view.x, y: view.y, z: view.z, yaw };
    this.engine.setListener(view.x, view.y + EYE, view.z, yaw);
    this.dryCooldown = Math.max(0, this.dryCooldown - dt);
    this.localTeam = localState?.team ?? this.localTeam;

    for (const p of snap.players) {
      if (!p.alive) { this.tracks.delete(p.id); continue; }
      const local = this.isLocal(p.id);
      const x = local ? view.x : p.x;
      const y = local ? view.y : p.y;
      const z = local ? view.z : p.z;
      let t = this.tracks.get(p.id);
      if (!t) {
        t = { x, y, z, dist: 0, ground: p.ground, vy: p.vy };
        this.tracks.set(p.id, t);
      }
      const moved = Math.hypot(x - t.x, z - t.z);
      const speed = moved / Math.max(dt, 1e-4);
      if (moved > 3) t.dist = 0;
      else if (p.ground && speed > RUN_THRESHOLD) t.dist += moved;
      if (t.dist >= STEP_DISTANCE) {
        t.dist = 0;
        const surface = y > 0.3 ? 'metal' : 'concrete';
        this.play('footstep', surface, local ? null : [x, y, z], 0.3);
      }
      if (t.ground && !p.ground && p.vy > 3) this.play('jump', null, local ? null : [x, y, z], 0.2);
      if (!t.ground && p.ground && t.vy < -4) this.play('land', t.vy < -9, local ? null : [x, y, z], 0.3);
      t.x = x; t.y = y; t.z = z; t.ground = p.ground; t.vy = p.vy;
    }

    if (localState) {
      if (localState.reloading && !this.prevReloading) this.play('reload', null, null, 0.3);
      this.prevReloading = localState.reloading;
      const canShoot = localState.alive && localState.weapon !== 'knife' && snap.phase === 'live';
      if (firing && canShoot && localState.mag === 0 && !localState.reloading && this.dryCooldown <= 0) {
        this.play('dryClick', null, null, 0);
        this.dryCooldown = 0.25;
      }
    }

    this.updateBomb(dt, snap, view);
  }

  /** Beeps once per second, speeding up to 6 per second in the last ten seconds. */
  updateBomb(dt, snap, _view) {
    const b = snap.bomb;
    if (b.state !== 'planted') { this.beepTimer = 0; return; }
    this.beepTimer -= dt;
    if (this.beepTimer > 0) return;
    const left = Math.max(0, b.timer);
    const urgency = left > 10 ? 0 : 1 - left / 10;
    this.beepTimer = left > 10 ? 1 : 0.9 - urgency * 0.75;
    const pos = b.pos ? [b.pos[0], 0.6, b.pos[1]] : null;
    this.play('bombBeep', urgency, pos, 0.4);
  }
}
