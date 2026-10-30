// Economy: rewards, loss streak bonus and buy validation. Pure functions.
import { MAX_ARMOR, MAX_MONEY, START_MONEY, TEAM_T } from './constants.js';
import { getWeapon, isAllowedForTeam, startingSecondary } from './weapons.js';

export const WIN_REWARD = 3250;
export const LOSS_REWARD_BASE = 1400;
export const LOSS_STREAK_STEP = 500;
export const LOSS_STREAK_MAX = 4;
export const PLANT_BONUS = 300;
export const DEFUSE_BONUS = 300;
/** Extra money for every T player when the bomb was planted but the round was lost. */
export const PLANTED_LOSS_BONUS = 800;
export const DEFAULT_KILL_REWARD = 300;

export function clampMoney(amount) {
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.min(MAX_MONEY, Math.floor(amount)));
}

export function addMoney(current, delta) {
  return clampMoney(current + delta);
}

/** Money for killing someone with the given weapon (grenades use their own entry). */
export function killReward(weaponId) {
  const w = getWeapon(weaponId);
  return w ? w.killReward : DEFAULT_KILL_REWARD;
}

/** Reward for losing a round, given the number of consecutive losses before it. */
export function lossReward(lossStreak) {
  const streak = Math.max(0, Math.min(LOSS_STREAK_MAX, Math.floor(lossStreak)));
  return LOSS_REWARD_BASE + streak * LOSS_STREAK_STEP;
}

export function nextLossStreak(previous, won) {
  return won ? 0 : Math.min(LOSS_STREAK_MAX, previous + 1);
}

/**
 * Per-player reward for the end of a round.
 * @param {{team:string, won:boolean, lossStreak:number, bombPlanted:boolean}} p
 */
export function roundReward({ team, won, lossStreak, bombPlanted }) {
  if (won) return WIN_REWARD;
  const bonus = team === TEAM_T && bombPlanted ? PLANTED_LOSS_BONUS : 0;
  return lossReward(lossStreak) + bonus;
}

export function createInventory(team) {
  return {
    team,
    money: START_MONEY,
    armor: 0,
    hasKit: false,
    primary: null,
    secondary: startingSecondary(team),
    knife: true,
    grenades: { smoke: 0, flash: 0, he: 0 },
  };
}

/** Inventory after dying: everything is lost and the pistol resets. */
export function resetLoadout(inv) {
  inv.armor = 0;
  inv.hasKit = false;
  inv.primary = null;
  inv.secondary = startingSecondary(inv.team);
  inv.grenades = { smoke: 0, flash: 0, he: 0 };
  return inv;
}

function fail(code, reason) {
  return { ok: false, code, reason };
}

/** Checks whether the inventory may buy the item right now. */
export function canBuy(inv, itemId, buyPhase) {
  const item = getWeapon(itemId);
  if (!item || item.id === 'knife') return fail('unknown_item', 'Noma\'lum buyum');
  if (!buyPhase) return fail('buy_closed', 'Xarid vaqti tugagan');
  if (!isAllowedForTeam(itemId, inv.team)) return fail('wrong_team', 'Bu buyum sizning jamoangiz uchun emas');
  switch (item.slot) {
    case 'primary':
      if (inv.primary === itemId) return fail('owned', 'Bu qurol allaqachon bor');
      break;
    case 'secondary':
      if (inv.secondary === itemId) return fail('owned', 'Bu qurol allaqachon bor');
      break;
    case 'grenade':
      if (inv.grenades[itemId] >= item.maxCarry) return fail('limit', 'Granata chegarasiga yetdingiz');
      break;
    case 'armor':
      if (inv.armor >= MAX_ARMOR) return fail('owned', 'Zirh allaqachon to\'liq');
      break;
    case 'kit':
      if (inv.hasKit) return fail('owned', 'To\'plam allaqachon bor');
      break;
    default:
      return fail('unknown_item', 'Noma\'lum buyum');
  }
  if (inv.money < item.price) return fail('no_money', 'Pul yetarli emas');
  return { ok: true, code: 'ok', reason: '' };
}

/** Buys the item and mutates the inventory when allowed. */
export function purchase(inv, itemId, buyPhase) {
  const check = canBuy(inv, itemId, buyPhase);
  if (!check.ok) return check;
  const item = getWeapon(itemId);
  inv.money = clampMoney(inv.money - item.price);
  switch (item.slot) {
    case 'primary': inv.primary = itemId; break;
    case 'secondary': inv.secondary = itemId; break;
    case 'grenade': inv.grenades[itemId] += 1; break;
    case 'armor': inv.armor = item.armorValue; break;
    case 'kit': inv.hasKit = true; break;
    default: break;
  }
  return { ok: true, code: 'ok', reason: '', cost: item.price };
}
