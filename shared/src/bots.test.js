import { describe, it, expect } from 'vitest';
import { DIFFICULTIES, BOT_STATES, difficultyParams, chooseBuys } from './bots.js';
import { GameSim } from './sim.js';
import { WAYPOINTS, findPath, nearestWaypoint } from './waypoints.js';
import { TICK_RATE, BUY_TIME } from './constants.js';

function team(sim, prefix, side) {
  for (let i = 0; i < 5; i++) sim.addPlayer({ id: `${prefix}${i}`, name: `${prefix}${i}`, team: side, isBot: true });
}

describe('difficulty', () => {
  it('has three levels where harder bots react faster and aim better', () => {
    expect(Object.keys(DIFFICULTIES)).toEqual(['oson', 'orta', 'qiyin']);
    expect(DIFFICULTIES.qiyin.reaction).toBeLessThan(DIFFICULTIES.orta.reaction);
    expect(DIFFICULTIES.orta.reaction).toBeLessThan(DIFFICULTIES.oson.reaction);
    expect(DIFFICULTIES.qiyin.aimError).toBeLessThan(DIFFICULTIES.oson.aimError);
    expect(DIFFICULTIES.qiyin.hearing).toBeGreaterThan(DIFFICULTIES.oson.hearing);
    expect(difficultyParams('unknown').id).toBe('orta');
  });
});

describe('bot pathing', () => {
  it('finds an A* path between the bases', () => {
    const a = nearestWaypoint(WAYPOINTS, 0, -80, 0);
    const b = nearestWaypoint(WAYPOINTS, -42, 75, 0);
    const path = findPath(WAYPOINTS, a, b);
    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThan(3);
  });

  it('bots walk from spawn toward their site', () => {
    const sim = new GameSim({ seed: 5 });
    team(sim, 'c', 'CT');
    team(sim, 't', 'T');
    sim.tick();
    const before = new Map([...sim.players.values()].map((p) => [p.id, [p.body.x, p.body.z]]));
    for (let i = 0; i < (BUY_TIME + 8) * TICK_RATE; i++) sim.tick();
    let moved = 0;
    for (const p of sim.players.values()) {
      const [x, z] = before.get(p.id);
      if (!p.alive || Math.hypot(p.body.x - x, p.body.z - z) > 5) moved += 1;
    }
    expect(moved).toBeGreaterThan(6);
  });

  it('splits T bots between sites and one carries the bomb', () => {
    const sim = new GameSim({ seed: 8 });
    team(sim, 'c', 'CT');
    team(sim, 't', 'T');
    sim.tick();
    const sites = new Set([...sim.players.values()].filter((p) => p.team === 'T').map((p) => p.brain.site));
    expect(sites.size).toBe(2);
    expect(sim.bombCarrier).not.toBeNull();
    expect(sim.players.get(sim.bombCarrier).team).toBe('T');
  });

  it('uses the defined FSM states only', () => {
    const sim = new GameSim({ seed: 6 });
    team(sim, 'c', 'CT');
    team(sim, 't', 'T');
    const allowed = new Set(Object.values(BOT_STATES));
    for (let i = 0; i < 40 * TICK_RATE; i++) {
      sim.tick();
      for (const p of sim.players.values()) if (p.alive) expect(allowed.has(p.brain.state)).toBe(true);
    }
  });

  it('CT bots rotate to a planted bomb and one defuses', () => {
    const sim = new GameSim({ seed: 5, difficulty: 'qiyin' });
    team(sim, 'c', 'CT');
    team(sim, 't', 'T');
    let planted = false;
    let defused = false;
    for (let i = 0; i < 600 * TICK_RATE; i++) {
      for (const e of sim.tick()) {
        if (e.type === 'planted') planted = true;
        if (e.type === 'defused') defused = true;
      }
    }
    expect(planted).toBe(true);
    expect(defused).toBe(true);
  });
});

describe('bot buying', () => {
  it('buys a rifle and armor with enough money, only team items', () => {
    const sim = new GameSim({ seed: 1 });
    team(sim, 't', 'T');
    const p = sim.players.get('t0');
    p.inv.money = 9000;
    const items = chooseBuys(sim, p);
    expect(items.includes('m4a4')).toBe(false);
    expect(items.some((i) => ['ak47', 'awp'].includes(i))).toBe(true);
    expect(items).toContain('armor');
  });

  it('saves when poor', () => {
    const sim = new GameSim({ seed: 1 });
    team(sim, 't', 'T');
    const p = sim.players.get('t0');
    p.inv.money = 300;
    const items = chooseBuys(sim, p);
    expect(items.every((i) => ['flash', 'smoke', 'he'].includes(i))).toBe(true);
  });
});
