// Global game constants shared by server, client and tests.

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;

export const TEAM_CT = 'CT';
export const TEAM_T = 'T';
export const TEAMS = [TEAM_CT, TEAM_T];

export const TEAM_COLORS = {
  CT: { hex: '#3b82f6', rgb: [59, 130, 246] },
  T: { hex: '#f59e0b', rgb: [245, 158, 11] },
};

export const TEAM_NAMES_UZ = { CT: 'Himoyachilar', T: 'Hujumchilar' };

export const TEAM_SIZE = 5;
export const ROUNDS_TO_WIN = 8;
export const MAX_ROUNDS = ROUNDS_TO_WIN * 2 - 1;
/** Sides swap once, after this many rounds have been played. */
export const HALFTIME_AFTER_ROUND = 4;

export const ROUND_TIME = 115;
export const BUY_TIME = 6;
export const ROUND_END_DELAY = 5;

export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 7;
export const DEFUSE_TIME_KIT = 3.5;
export const BOMB_TIME = 40;
/** Maximum distance from the bomb at which a defuse can be held. */
export const DEFUSE_RANGE = 2.5;

export const START_MONEY = 800;
export const MAX_MONEY = 16000;

export const HEADSHOT_MULTIPLIER = 4;
export const MAX_HEALTH = 100;
export const MAX_ARMOR = 100;

// Player body (meters, seconds).
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.6;
export const STEP_HEIGHT = 0.5;
export const RUN_SPEED = 6.2;
export const WALK_SPEED = 3.2;
export const GRAVITY = 24;
export const JUMP_SPEED = 7.2;

export const MAX_NAME_LENGTH = 16;
export const MAX_CHAT_LENGTH = 120;
export const ROOM_CODE_LENGTH = 5;
