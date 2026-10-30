// Round and match state machine: freeze (buy) -> live -> ended, side swap, match end.
import {
  BUY_TIME, HALFTIME_AFTER_ROUND, MAX_ROUNDS, ROUNDS_TO_WIN, ROUND_END_DELAY, ROUND_TIME,
  TEAM_CT, TEAM_T,
} from './constants.js';
import {
  BOMB_DEFUSED, BOMB_EXPLODED, BOMB_PLANTED, BOMB_PLANTING, beginDefuse, beginPlant, cancelDefuse, cancelPlant, createBomb,
  updateBomb,
} from './bomb.js';
import { nextLossStreak, roundReward } from './economy.js';

export const PHASE_FREEZE = 'freeze';
export const PHASE_LIVE = 'live';
export const PHASE_ENDED = 'ended';
export const PHASE_MATCH_END = 'matchEnd';

export const REASON_ELIMINATED = 'eliminated';
export const REASON_EXPLODED = 'exploded';
export const REASON_DEFUSED = 'defused';
export const REASON_TIME = 'time';

export function otherTeam(team) {
  return team === TEAM_CT ? TEAM_T : TEAM_CT;
}

export function createMatch() {
  return {
    phase: PHASE_FREEZE,
    round: 1,
    timer: BUY_TIME,
    score: { CT: 0, T: 0 },
    lossStreak: { CT: 0, T: 0 },
    swaps: 0,
    endTimer: 0,
    winner: null,
    result: null,
    bomb: createBomb(),
  };
}

/** Players cannot move during the buy (freeze) phase. */
export function canMove(match) {
  return match.phase !== PHASE_FREEZE;
}

export function isBuyPhase(match) {
  return match.phase === PHASE_FREEZE;
}

/** Plant is only possible while the round is live and the clock has not run out. */
export function requestPlant(match, planterId, site) {
  if (match.phase !== PHASE_LIVE || match.timer <= 0) return false;
  return beginPlant(match.bomb, planterId, site);
}

export function stopPlant(match) {
  return cancelPlant(match.bomb);
}

export function requestDefuse(match, defuserId, hasKit) {
  if (match.phase !== PHASE_LIVE) return false;
  return beginDefuse(match.bomb, defuserId, hasKit);
}

export function stopDefuse(match) {
  return cancelDefuse(match.bomb);
}

function endRound(match, winner, reason, events) {
  const planted = [BOMB_PLANTED, BOMB_DEFUSED, BOMB_EXPLODED].includes(match.bomb.state);
  const rewards = {};
  for (const team of [TEAM_CT, TEAM_T]) {
    const won = team === winner;
    rewards[team] = roundReward({
      team, won, lossStreak: match.lossStreak[team], bombPlanted: planted,
    });
    match.lossStreak[team] = nextLossStreak(match.lossStreak[team], won);
  }
  match.score[winner] += 1;
  match.phase = PHASE_ENDED;
  match.endTimer = ROUND_END_DELAY;
  match.result = { round: match.round, winner, reason, rewards, bombPlanted: planted };
  events.push({
    type: 'round_end', round: match.round, winner, reason, rewards,
    score: { CT: match.score.CT, T: match.score.T },
  });
  if (match.score[winner] >= ROUNDS_TO_WIN || match.round >= MAX_ROUNDS) {
    match.phase = PHASE_MATCH_END;
    match.winner = match.score.CT === match.score.T ? null : (match.score.CT > match.score.T ? TEAM_CT : TEAM_T);
    events.push({ type: 'match_end', winner: match.winner, score: { CT: match.score.CT, T: match.score.T } });
  }
}

function startNextRound(match, events) {
  const finished = match.round;
  match.round += 1;
  match.bomb = createBomb();
  match.result = null;
  if (finished === HALFTIME_AFTER_ROUND) {
    const { CT, T } = match.score;
    match.score = { CT: T, T: CT };
    match.lossStreak = { CT: 0, T: 0 };
    match.swaps += 1;
    events.push({ type: 'sides_swapped', score: { CT: match.score.CT, T: match.score.T }, resetEconomy: true });
  }
  match.phase = PHASE_FREEZE;
  match.timer = BUY_TIME;
  events.push({ type: 'round_start', round: match.round });
}

/**
 * Advances the match by dt seconds.
 * @param {object} match state from createMatch
 * @param {number} dt seconds
 * @param {{CT:number, T:number}} alive number of living players per team
 * @returns {object[]} events: live, planted, beep, defused, exploded, round_end,
 *   match_end, sides_swapped, round_start
 */
export function updateRound(match, dt, alive) {
  const events = [];
  switch (match.phase) {
    case PHASE_FREEZE:
      match.timer -= dt;
      if (match.timer <= 0) {
        match.phase = PHASE_LIVE;
        match.timer = ROUND_TIME;
        events.push({ type: 'live', round: match.round });
      }
      break;
    case PHASE_LIVE: {
      const bombEvents = updateBomb(match.bomb, dt);
      for (const e of bombEvents) events.push(e);
      const planting = match.bomb.state === BOMB_PLANTING;
      const planted = match.bomb.state === BOMB_PLANTED;
      if (!planted && !planting) match.timer = Math.max(0, match.timer - dt);

      const exploded = bombEvents.find((e) => e.type === 'exploded');
      const defused = bombEvents.find((e) => e.type === 'defused');
      if (exploded) {
        endRound(match, TEAM_T, REASON_EXPLODED, events);
      } else if (defused) {
        endRound(match, TEAM_CT, REASON_DEFUSED, events);
      } else if (alive.CT <= 0) {
        endRound(match, TEAM_T, REASON_ELIMINATED, events);
      } else if (alive.T <= 0 && !planted) {
        endRound(match, TEAM_CT, REASON_ELIMINATED, events);
      } else if (match.timer <= 0 && !planting && !planted) {
        endRound(match, TEAM_CT, REASON_TIME, events);
      }
      break;
    }
    case PHASE_ENDED:
      match.endTimer -= dt;
      if (match.endTimer <= 0) startNextRound(match, events);
      break;
    default:
      break;
  }
  return events;
}
