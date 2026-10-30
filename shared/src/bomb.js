// Bomb state machine: plant, countdown, defuse and explosion. Pure and deterministic.
import { BOMB_TIME, DEFUSE_TIME, DEFUSE_TIME_KIT, PLANT_TIME } from './constants.js';

export const BOMB_IDLE = 'idle';
export const BOMB_PLANTING = 'planting';
export const BOMB_PLANTED = 'planted';
export const BOMB_DEFUSED = 'defused';
export const BOMB_EXPLODED = 'exploded';

export function createBomb() {
  return {
    state: BOMB_IDLE,
    site: null,
    planter: null,
    plantProgress: 0,
    timer: BOMB_TIME,
    defuser: null,
    defuseProgress: 0,
    defuseNeeded: DEFUSE_TIME,
    nextBeep: 0,
  };
}

/** Seconds between beeps: constant until 10 s remain, then speeding up toward 0.1 s. */
export function beepInterval(timeLeft) {
  if (timeLeft > 10) return 1;
  return 0.1 + 0.9 * (Math.max(0, timeLeft) / 10);
}

export function isPlanted(bomb) {
  return bomb.state === BOMB_PLANTED;
}

export function isActive(bomb) {
  return bomb.state === BOMB_PLANTING || bomb.state === BOMB_PLANTED;
}

export function beginPlant(bomb, planterId, site) {
  if (bomb.state !== BOMB_IDLE) return false;
  bomb.state = BOMB_PLANTING;
  bomb.planter = planterId;
  bomb.site = site;
  bomb.plantProgress = 0;
  return true;
}

export function cancelPlant(bomb) {
  if (bomb.state !== BOMB_PLANTING) return false;
  bomb.state = BOMB_IDLE;
  bomb.planter = null;
  bomb.site = null;
  bomb.plantProgress = 0;
  return true;
}

export function beginDefuse(bomb, defuserId, hasKit) {
  if (bomb.state !== BOMB_PLANTED) return false;
  if (bomb.defuser !== null && bomb.defuser !== defuserId) return false;
  if (bomb.defuser === defuserId) return true;
  bomb.defuser = defuserId;
  bomb.defuseProgress = 0;
  bomb.defuseNeeded = hasKit ? DEFUSE_TIME_KIT : DEFUSE_TIME;
  return true;
}

export function cancelDefuse(bomb) {
  if (bomb.defuser === null) return false;
  bomb.defuser = null;
  bomb.defuseProgress = 0;
  return true;
}

/** Fraction 0..1 of the current plant or defuse action. */
export function actionProgress(bomb) {
  if (bomb.state === BOMB_PLANTING) return Math.min(1, bomb.plantProgress / PLANT_TIME);
  if (bomb.defuser !== null) return Math.min(1, bomb.defuseProgress / bomb.defuseNeeded);
  return 0;
}

/**
 * Advances the bomb by dt seconds and returns the events that occurred:
 * 'planted', 'beep', 'defused', 'exploded'.
 */
export function updateBomb(bomb, dt) {
  const events = [];
  if (bomb.state === BOMB_PLANTING) {
    bomb.plantProgress += dt;
    if (bomb.plantProgress >= PLANT_TIME) {
      bomb.state = BOMB_PLANTED;
      bomb.timer = BOMB_TIME;
      bomb.nextBeep = 0;
      events.push({ type: 'planted', site: bomb.site, planter: bomb.planter });
    }
    return events;
  }
  if (bomb.state !== BOMB_PLANTED) return events;

  if (bomb.defuser !== null) {
    bomb.defuseProgress += dt;
    if (bomb.defuseProgress >= bomb.defuseNeeded) {
      bomb.state = BOMB_DEFUSED;
      events.push({ type: 'defused', defuser: bomb.defuser, site: bomb.site });
      return events;
    }
  }

  bomb.timer -= dt;
  if (bomb.timer <= 0) {
    bomb.timer = 0;
    bomb.state = BOMB_EXPLODED;
    events.push({ type: 'exploded', site: bomb.site });
    return events;
  }

  bomb.nextBeep -= dt;
  if (bomb.nextBeep <= 0) {
    events.push({ type: 'beep', timeLeft: bomb.timer });
    bomb.nextBeep += beepInterval(bomb.timer);
  }
  return events;
}
