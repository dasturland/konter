import { describe, it, expect } from 'vitest';
import {
  PHASE_ENDED, PHASE_FREEZE, PHASE_LIVE, PHASE_MATCH_END, REASON_DEFUSED, REASON_ELIMINATED,
  REASON_EXPLODED, REASON_TIME, canMove, createMatch, isBuyPhase, requestDefuse, requestPlant,
  updateRound,
} from './round.js';

const ALL = { CT: 5, T: 5 };

function advance(match, seconds, alive = ALL, dt = 0.05) {
  const events = [];
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) events.push(...updateRound(match, dt, alive));
  return events;
}

function goLive(match) {
  advance(match, 6.1);
}

describe('round phases', () => {
  it('starts in a 6 second freeze phase without movement', () => {
    const m = createMatch();
    expect(m.phase).toBe(PHASE_FREEZE);
    expect(canMove(m)).toBe(false);
    expect(isBuyPhase(m)).toBe(true);
    advance(m, 5.5);
    expect(m.phase).toBe(PHASE_FREEZE);
    const events = advance(m, 0.6);
    expect(m.phase).toBe(PHASE_LIVE);
    expect(canMove(m)).toBe(true);
    expect(isBuyPhase(m)).toBe(false);
    expect(events.some((e) => e.type === 'live')).toBe(true);
    expect(m.timer).toBeCloseTo(115, 0);
  });

  it('ends with a CT win on timeout', () => {
    const m = createMatch();
    goLive(m);
    const events = advance(m, 116);
    const end = events.find((e) => e.type === 'round_end');
    expect(end.winner).toBe('CT');
    expect(end.reason).toBe(REASON_TIME);
    expect(m.score.CT).toBe(1);
    expect(m.phase).toBe(PHASE_ENDED);
  });

  it('ends when all Ts or all CTs are dead', () => {
    const a = createMatch();
    goLive(a);
    const e1 = advance(a, 0.1, { CT: 3, T: 0 }).find((e) => e.type === 'round_end');
    expect(e1.winner).toBe('CT');
    expect(e1.reason).toBe(REASON_ELIMINATED);
    const b = createMatch();
    goLive(b);
    const e2 = advance(b, 0.1, { CT: 0, T: 2 }).find((e) => e.type === 'round_end');
    expect(e2.winner).toBe('T');
  });

  it('keeps the round going after Ts die when the bomb is planted', () => {
    const m = createMatch();
    goLive(m);
    expect(requestPlant(m, 't1', 'A')).toBe(true);
    advance(m, 3.6);
    expect(m.bomb.state).toBe('planted');
    advance(m, 1, { CT: 3, T: 0 });
    expect(m.phase).toBe(PHASE_LIVE);
    const events = advance(m, 40, { CT: 3, T: 0 });
    const end = events.find((e) => e.type === 'round_end');
    expect(end.winner).toBe('T');
    expect(end.reason).toBe(REASON_EXPLODED);
  });

  it('gives CT the win when the bomb is defused', () => {
    const m = createMatch();
    goLive(m);
    requestPlant(m, 't1', 'B');
    advance(m, 3.6);
    expect(requestDefuse(m, 'c1', true)).toBe(true);
    const events = advance(m, 4);
    const end = events.find((e) => e.type === 'round_end');
    expect(end.winner).toBe('CT');
    expect(end.reason).toBe(REASON_DEFUSED);
    expect(end.rewards.T).toBe(1400 + 800);
  });

  it('does not stop the clock-based end while the bomb is planted', () => {
    const m = createMatch();
    goLive(m);
    advance(m, 100);
    requestPlant(m, 't1', 'A');
    advance(m, 3.6);
    advance(m, 10);
    expect(m.phase).toBe(PHASE_LIVE);
  });

  it('refuses to plant outside the live phase', () => {
    const m = createMatch();
    expect(requestPlant(m, 't1', 'A')).toBe(false);
  });
});

describe('match flow', () => {
  function playRound(m, winner) {
    goLive(m);
    const events = advance(m, 0.1, winner === 'CT' ? { CT: 1, T: 0 } : { CT: 0, T: 1 });
    events.push(...advance(m, 5.1));
    return events;
  }

  it('tracks score and loss streaks across rounds', () => {
    const m = createMatch();
    playRound(m, 'CT');
    expect(m.score).toEqual({ CT: 1, T: 0 });
    expect(m.lossStreak).toEqual({ CT: 0, T: 1 });
    expect(m.round).toBe(2);
    expect(m.phase).toBe(PHASE_FREEZE);
    playRound(m, 'CT');
    expect(m.lossStreak.T).toBe(2);
  });

  it('swaps sides once after round 4', () => {
    const m = createMatch();
    for (let i = 0; i < 3; i++) playRound(m, 'CT');
    expect(m.swaps).toBe(0);
    const events = playRound(m, 'T');
    expect(events.some((e) => e.type === 'sides_swapped')).toBe(true);
    expect(m.swaps).toBe(1);
    expect(m.round).toBe(5);
    // Score follows the teams: CT had 3 wins and T had 1 before the swap.
    expect(m.score).toEqual({ CT: 1, T: 3 });
    expect(m.lossStreak).toEqual({ CT: 0, T: 0 });
    for (let i = 0; i < 4; i++) playRound(m, 'CT');
    expect(m.swaps).toBe(1);
  });

  it('ends the match at 8 round wins', () => {
    const m = createMatch();
    let events = [];
    for (let i = 0; i < 20 && m.phase !== PHASE_MATCH_END; i++) {
      events = playRound(m, i % 4 === 3 ? 'T' : 'CT');
    }
    expect(m.phase).toBe(PHASE_MATCH_END);
    expect(Math.max(m.score.CT, m.score.T)).toBe(8);
    expect(events.some((e) => e.type === 'match_end')).toBe(true);
    expect(m.winner === 'CT' || m.winner === 'T').toBe(true);
    const after = advance(m, 20);
    expect(after.length).toBe(0);
  });
});
