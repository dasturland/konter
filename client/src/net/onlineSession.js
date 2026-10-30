// Online mode adapter with the same surface as SoloSession, so Game can drive either one.
// Remote players are interpolated ~100 ms behind, the local player is predicted and reconciled.
import { TICK_DT } from '@konter/shared';
import { SnapshotBuffer } from './interpolation.js';
import { Predictor } from './prediction.js';

const CATCH_UP_LIMIT = 5;

export class OnlineSession {
  /** @param {import('./client.js').NetClient} net */
  constructor(net) {
    this.net = net;
    this.localId = net.id;
    this.isOnline = true;
    this.buffer = new SnapshotBuffer();
    this.predictor = new Predictor();
    this.accumulator = 0;
    this.snap = null;
    this.latest = null;
    this.events = [];
    this.pings = {};
    this.paused = false;
    this.onBuyResult = null;
    this.offs = [
      net.on('snapshot', (m) => this.onSnapshot(m)),
      net.on('event', (m) => this.onEvent(m)),
      net.on('reconnected', () => { this.predictor.reset(); }),
    ];
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
  }

  onSnapshot(m) {
    this.latest = m;
    this.pings = m.pings ?? this.pings;
    this.buffer.push(m, performance.now());
    const me = m.players.find((p) => p.id === this.localId);
    if (me) this.predictor.reconcile(me);
  }

  onEvent(m) {
    if (m.kind === 'buy') {
      if (this.onBuyResult) this.onBuyResult({ ok: m.ok !== false, text: m.text ?? '', code: m.code ?? '' });
      return;
    }
    this.events.push(m);
  }

  get localPlayer() {
    return { health: this.meState()?.health ?? 100, punch: [0, 0] };
  }

  meState() {
    return this.latest?.players.find((p) => p.id === this.localId) ?? null;
  }

  punchOf() {
    return [0, 0];
  }

  /** Context the predictor needs for the next commands (weapon, freeze time, bomb actions). */
  updateContext(me, snap) {
    const bomb = snap.bomb;
    const planting = bomb.state === 'planting' && me.bombCarrier;
    const defusing = bomb.defuse > 0 && me.team === 'CT';
    this.predictor.setContext({
      weapon: me.weapon, moveAllowed: snap.phase !== 'freeze' && me.alive, frozen: planting || defusing,
    });
  }

  /** Sends one input per fixed tick and applies it locally right away. */
  update(dt, makeCommand) {
    const out = this.events;
    this.events = [];
    const rendered = this.buffer.sample(performance.now());
    this.snap = rendered;
    const me = this.meState();
    if (!rendered || !me) return out;
    this.updateContext(me, this.latest);
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= TICK_DT && steps < CATCH_UP_LIMIT) {
      this.accumulator -= TICK_DT;
      steps += 1;
      const cmd = makeCommand();
      this.net.sendInput(cmd);
      if (me.alive) this.predictor.apply(cmd);
    }
    if (steps === CATCH_UP_LIMIT) this.accumulator = 0;
    this.predictor.smooth(dt);
    return out;
  }

  /** Local view: predicted position while alive, server position otherwise. */
  localView() {
    const me = this.meState();
    if (!me) return null;
    const p = this.predictor.initialized && me?.alive ? this.predictor.position() : { x: me.x, y: me.y, z: me.z };
    return { x: p.x, y: p.y, z: p.z, state: me, punch: [0, 0] };
  }

  buy(itemId) {
    this.net.buy(itemId);
    return { ok: true, pending: true };
  }

  setPaused() {}
}
