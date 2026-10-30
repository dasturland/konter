import { describe, it, expect } from 'vitest';
import {
  BOMB_DEFUSED, BOMB_EXPLODED, BOMB_IDLE, BOMB_PLANTED, BOMB_PLANTING, actionProgress, beepInterval,
  beginDefuse, beginPlant, cancelDefuse, cancelPlant, createBomb, updateBomb,
} from './bomb.js';

function run(bomb, seconds, dt = 0.05) {
  const events = [];
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) events.push(...updateBomb(bomb, dt));
  return events;
}

function planted() {
  const b = createBomb();
  beginPlant(b, 'p1', 'A');
  run(b, 3.6);
  return b;
}

describe('bomb planting', () => {
  it('takes 3.5 seconds to plant', () => {
    const b = createBomb();
    expect(beginPlant(b, 'p1', 'A')).toBe(true);
    expect(b.state).toBe(BOMB_PLANTING);
    run(b, 3.0);
    expect(b.state).toBe(BOMB_PLANTING);
    expect(actionProgress(b)).toBeGreaterThan(0.8);
    const events = run(b, 0.6);
    expect(b.state).toBe(BOMB_PLANTED);
    expect(events.some((e) => e.type === 'planted' && e.site === 'A')).toBe(true);
  });

  it('resets progress when the plant is cancelled', () => {
    const b = createBomb();
    beginPlant(b, 'p1', 'B');
    run(b, 2);
    expect(cancelPlant(b)).toBe(true);
    expect(b.state).toBe(BOMB_IDLE);
    expect(b.plantProgress).toBe(0);
    expect(beginPlant(b, 'p2', 'A')).toBe(true);
  });

  it('cannot plant twice', () => {
    const b = createBomb();
    beginPlant(b, 'p1', 'A');
    expect(beginPlant(b, 'p2', 'B')).toBe(false);
  });
});

describe('bomb countdown', () => {
  it('explodes 40 seconds after planting', () => {
    const b = planted();
    expect(b.timer).toBeCloseTo(40, 0);
    const events = run(b, 39.5);
    expect(b.state).toBe(BOMB_PLANTED);
    expect(events.some((e) => e.type === 'exploded')).toBe(false);
    const more = run(b, 1);
    expect(more.some((e) => e.type === 'exploded')).toBe(true);
    expect(b.state).toBe(BOMB_EXPLODED);
  });

  it('beeps faster during the last 10 seconds', () => {
    expect(beepInterval(30)).toBe(1);
    expect(beepInterval(10)).toBeCloseTo(1);
    expect(beepInterval(5)).toBeLessThan(beepInterval(9));
    expect(beepInterval(1)).toBeLessThan(beepInterval(5));
    expect(beepInterval(0)).toBeGreaterThan(0);
    const b = planted();
    const early = run(b, 10).filter((e) => e.type === 'beep').length;
    run(b, 20);
    const late = run(b, 9.5).filter((e) => e.type === 'beep').length;
    expect(late).toBeGreaterThan(early);
  });
});

describe('bomb defusing', () => {
  it('takes 7 seconds without a kit', () => {
    const b = planted();
    expect(beginDefuse(b, 'c1', false)).toBe(true);
    run(b, 6.5);
    expect(b.state).toBe(BOMB_PLANTED);
    const events = run(b, 0.6);
    expect(events.some((e) => e.type === 'defused')).toBe(true);
    expect(b.state).toBe(BOMB_DEFUSED);
  });

  it('takes 3.5 seconds with a kit', () => {
    const b = planted();
    beginDefuse(b, 'c1', true);
    run(b, 3.0);
    expect(b.state).toBe(BOMB_PLANTED);
    run(b, 0.6);
    expect(b.state).toBe(BOMB_DEFUSED);
  });

  it('resets defuse progress when cancelled and lets only one defuser act', () => {
    const b = planted();
    beginDefuse(b, 'c1', false);
    expect(beginDefuse(b, 'c2', true)).toBe(false);
    run(b, 5);
    cancelDefuse(b);
    expect(b.defuseProgress).toBe(0);
    beginDefuse(b, 'c2', false);
    run(b, 5);
    expect(b.state).toBe(BOMB_PLANTED);
  });

  it('explodes if the defuse is too late', () => {
    const b = planted();
    run(b, 38);
    beginDefuse(b, 'c1', false);
    run(b, 3);
    expect(b.state).toBe(BOMB_EXPLODED);
  });

  it('cannot defuse before planting', () => {
    expect(beginDefuse(createBomb(), 'c1', true)).toBe(false);
  });
});
