// Solo mode: runs the shared GameSim entirely in the browser. The local player is a human slot,
// everybody else is driven by the shared bot AI. Prediction is trivially local because the
// simulation is the authority; rendering interpolates between the last two fixed ticks.
import { GameSim, TEAM_CT, TEAM_T, TICK_DT, TEAM_SIZE, MAP } from '@konter/shared';

export const LOCAL_ID = 'local';

const BOT_NAMES = ['Anvar', 'Bobur', 'Davron', 'Eldor', 'Farrux', 'Gulom', 'Hasan', 'Ibrohim', 'Jasur'];

export class SoloSession {
  /**
   * @param {{difficulty?:string, team?:string, name?:string, seed?:number}} opts
   */
  constructor({ difficulty = 'orta', team = TEAM_CT, name = 'Siz', seed = (Date.now() & 0xffff) || 1 } = {}) {
    this.sim = new GameSim({ seed, map: MAP, difficulty });
    this.team = team;
    this.accumulator = 0;
    this.paused = false;
    this.events = [];
    this.snap = null;
    this.prev = null;
    this.sim.addPlayer({ id: LOCAL_ID, name, team, isBot: false });
    const other = team === TEAM_CT ? TEAM_T : TEAM_CT;
    let n = 0;
    for (let i = 0; i < TEAM_SIZE - 1; i++) this.sim.addPlayer({ id: `bot${n}`, name: BOT_NAMES[n++ % BOT_NAMES.length], team, isBot: true, difficulty });
    for (let i = 0; i < TEAM_SIZE; i++) this.sim.addPlayer({ id: `bot${n}`, name: BOT_NAMES[n++ % BOT_NAMES.length], team: other, isBot: true, difficulty });
    this.step(null);
  }

  get localPlayer() {
    return this.sim.players.get(LOCAL_ID);
  }

  /** Advances fixed ticks for the elapsed frame time. `makeCommand` is called once per tick. */
  update(dt, makeCommand) {
    if (this.paused) return [];
    this.accumulator += dt;
    const out = [];
    let steps = 0;
    while (this.accumulator >= TICK_DT && steps < 5) {
      this.accumulator -= TICK_DT;
      steps += 1;
      out.push(...this.step(makeCommand));
    }
    if (steps === 5) this.accumulator = 0;
    this.events = out;
    return out;
  }

  step(makeCommand) {
    if (makeCommand) this.sim.applyInput(LOCAL_ID, makeCommand());
    const events = this.sim.tick();
    this.prev = this.snap;
    this.snap = this.sim.snapshot();
    return events;
  }

  /** Interpolated position of the local player between the last two ticks. */
  localView() {
    const cur = this.snap.players.find((p) => p.id === LOCAL_ID);
    const prev = this.prev?.players.find((p) => p.id === LOCAL_ID) ?? cur;
    const a = Math.min(1, this.accumulator / TICK_DT);
    const teleport = Math.abs(cur.x - prev.x) + Math.abs(cur.z - prev.z) > 4;
    const k = teleport ? 1 : a;
    return {
      x: prev.x + (cur.x - prev.x) * k,
      y: prev.y + (cur.y - prev.y) * k,
      z: prev.z + (cur.z - prev.z) * k,
      state: cur,
      punch: this.localPlayer.punch,
    };
  }

  buy(itemId) {
    return this.sim.buy(LOCAL_ID, itemId);
  }

  setPaused(value) {
    this.paused = value;
  }
}
