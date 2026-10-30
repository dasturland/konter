import { describe, it, expect } from 'vitest';
import { GameSim, createRng } from './sim.js';
import { PHASE_FREEZE, PHASE_LIVE } from './round.js';
import { TICK_RATE, BUY_TIME } from './constants.js';

function botMatch(seed = 3, difficulty = 'orta') {
  const sim = new GameSim({ seed, difficulty });
  for (let i = 0; i < 5; i++) {
    sim.addPlayer({ id: `c${i}`, name: `c${i}`, team: 'CT', isBot: true });
    sim.addPlayer({ id: `t${i}`, name: `t${i}`, team: 'T', isBot: true });
  }
  return sim;
}

function run(sim, seconds, onEvent = () => {}) {
  for (let i = 0; i < seconds * TICK_RATE; i++) for (const e of sim.tick()) onEvent(e);
}

const idle = (over = {}) => ({
  seq: 1, mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, fire: false, reload: false, walk: false,
  use: false, scope: false, slot: null, throw: null, ...over,
});

describe('createRng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(5);
    const b = createRng(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('GameSim bots', () => {
  it('runs 60s of bot vs bot without throwing and ends a round', () => {
    const sim = botMatch(11);
    const ends = [];
    run(sim, 60, (e) => { if (e.type === 'round_end') ends.push(e); });
    expect(ends.length).toBeGreaterThan(0);
    expect(sim.match.score.CT + sim.match.score.T).toBeGreaterThan(0);
  });

  it('is deterministic with the same seed', () => {
    const a = botMatch(9);
    const b = botMatch(9);
    run(a, 30);
    run(b, 30);
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
  });

  it('plants the bomb and a round ends in an explosion on some seed', () => {
    let exploded = false;
    for (let seed = 1; seed <= 6 && !exploded; seed++) {
      const sim = botMatch(seed, 'oson');
      run(sim, 400, (e) => { if (e.type === 'exploded') exploded = true; });
    }
    expect(exploded).toBe(true);
  });

  it('awards kill money and counts kills', () => {
    const sim = botMatch(4, 'qiyin');
    let kills = 0;
    run(sim, 60, (e) => { if (e.type === 'kill') kills += 1; });
    expect(kills).toBeGreaterThan(0);
    const total = [...sim.players.values()].reduce((n, p) => n + p.kills, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('bots buy equipment during the buy phase', () => {
    const sim = botMatch(2);
    sim.tick();
    const bought = [...sim.players.values()].some((p) => p.inv.armor > 0 || p.inv.primary || p.inv.money < 800);
    expect(bought).toBe(true);
  });
});

describe('GameSim humans', () => {
  function duel() {
    const sim = new GameSim({ seed: 1 });
    sim.addPlayer({ id: 'h', name: 'H', team: 'CT' });
    sim.addPlayer({ id: 't', name: 'T', team: 'T' });
    sim.tick();
    return sim;
  }

  it('cannot move during the freeze phase, then moves at server speed', () => {
    const sim = duel();
    expect(sim.match.phase).toBe(PHASE_FREEZE);
    const z0 = sim.players.get('h').body.z;
    sim.applyInput('h', idle({ mz: 1 }));
    sim.tick();
    expect(sim.players.get('h').body.z).toBe(z0);
    run(sim, BUY_TIME + 0.5);
    expect(sim.match.phase).toBe(PHASE_LIVE);
    const p = sim.players.get('h');
    const start = p.body.z;
    for (let i = 0; i < 30; i++) sim.applyInput('h', idle({ seq: i + 2, mx: 5, mz: 50 })), sim.tick();
    const moved = Math.abs(start - p.body.z);
    expect(moved).toBeLessThan(6.2 * 1.01);
    expect(moved).toBeGreaterThan(3);
  });

  it('limits the input queue', () => {
    const sim = duel();
    for (let i = 0; i < 40; i++) sim.applyInput('h', idle({ seq: i }));
    expect(sim.players.get('h').queue.length).toBeLessThan(10);
  });

  it('buys weapons only in the buy phase and validates money', () => {
    const sim = duel();
    sim.players.get('h').inv.money = 5000;
    expect(sim.buy('h', 'm4a4').ok).toBe(true);
    expect(sim.players.get('h').inv.primary).toBe('m4a4');
    expect(sim.players.get('h').cur).toBe('m4a4');
    expect(sim.buy('h', 'ak47').ok).toBe(false);
    run(sim, BUY_TIME + 0.5);
    expect(sim.buy('h', 'armor').ok).toBe(false);
  });

  it('hits an enemy with hitscan fire and drops the weapon on death', () => {
    const sim = duel();
    const shooter = sim.players.get('h');
    const victim = sim.players.get('t');
    run(sim, BUY_TIME + 0.5);
    shooter.body.x = 0; shooter.body.z = 40; shooter.body.y = 0;
    victim.body.x = 0; victim.body.z = 32; victim.body.y = 0;
    victim.inv.primary = 'ak47';
    victim.ammo.ak47 = { mag: 30, reserve: 90 };
    victim.health = 20;
    let killed = false;
    for (let i = 0; i < 20 && !killed; i++) {
      sim.applyInput('h', idle({ seq: i + 1, fire: i % 2 === 0, yaw: 0, pitch: 0.0 }));
      for (const e of sim.tick()) if (e.type === 'kill') killed = true;
      shooter.body.x = 0; shooter.body.z = 40;
    }
    expect(killed).toBe(true);
    expect(victim.alive).toBe(false);
    expect(sim.drops.some((d) => d.weapon === 'ak47')).toBe(true);
    expect(shooter.kills).toBe(1);
  });

  it('picks up a dropped weapon with E', () => {
    const sim = duel();
    const p = sim.players.get('h');
    sim.drops.push({ id: 'dx', weapon: 'm4a4', x: p.body.x, y: p.body.y, z: p.body.z, mag: 12, reserve: 40 });
    sim.applyInput('h', idle({ use: true }));
    sim.tick();
    expect(p.inv.primary).toBe('m4a4');
    expect(p.ammo.m4a4.mag).toBe(12);
    expect(sim.drops.length).toBe(0);
  });

  it('does not pick up a weapon of the other team', () => {
    const sim = duel();
    const p = sim.players.get('h');
    sim.drops.push({ id: 'dx', weapon: 'ak47', x: p.body.x, y: p.body.y, z: p.body.z, mag: 30, reserve: 90 });
    sim.applyInput('h', idle({ use: true }));
    sim.tick();
    expect(p.inv.primary).toBe(null);
  });

  it('reloads from the reserve', () => {
    const sim = duel();
    const p = sim.players.get('h');
    run(sim, BUY_TIME + 0.5);
    p.ammo[p.cur].mag = 2;
    sim.applyInput('h', idle({ reload: true }));
    sim.tick();
    expect(p.reloadTimer).toBeGreaterThan(0);
    run(sim, 3);
    expect(p.ammo[p.cur].mag).toBeGreaterThan(2);
  });

  it('throws a grenade that detonates after its fuse', () => {
    const sim = duel();
    const p = sim.players.get('h');
    p.inv.grenades.flash = 1;
    run(sim, BUY_TIME + 0.5);
    sim.applyInput('h', idle({ throw: 'flash', pitch: 0.3 }));
    sim.tick();
    expect(sim.grenades.length).toBe(1);
    expect(p.inv.grenades.flash).toBe(0);
    let blew = false;
    run(sim, 3, (e) => { if (e.type === 'grenade') blew = true; });
    expect(blew).toBe(true);
    expect(sim.grenades.length).toBe(0);
  });

  it('plants the bomb in a site and the CT can defuse it', () => {
    const sim = duel();
    run(sim, BUY_TIME + 0.5);
    const t = sim.players.get('t');
    const ct = sim.players.get('h');
    sim.bombCarrier = 't';
    t.body.x = -42; t.body.z = 75; t.body.y = 0;
    let planted = false;
    for (let i = 0; i < 4 * TICK_RATE && !planted; i++) {
      sim.applyInput('t', idle({ seq: i + 1, use: true }));
      for (const e of sim.tick()) if (e.type === 'planted') planted = true;
    }
    expect(planted).toBe(true);
    ct.body.x = -40; ct.body.z = 75; ct.body.y = 0;
    let defused = false;
    for (let i = 0; i < 9 * TICK_RATE && !defused; i++) {
      sim.applyInput('h', idle({ seq: i + 1, use: true }));
      for (const e of sim.tick()) if (e.type === 'defused') defused = true;
    }
    expect(defused).toBe(true);
    expect(sim.match.score.CT).toBe(1);
  });

  it('replaces human control with a bot and snapshots expose state', () => {
    const sim = duel();
    sim.setBotControl('h', true);
    run(sim, 2);
    const snap = sim.snapshot();
    expect(snap.players.find((p) => p.id === 'h').bot).toBe(true);
    expect(snap.tick).toBe(sim.tickCount);
  });
});
