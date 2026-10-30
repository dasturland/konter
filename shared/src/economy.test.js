import { describe, it, expect } from 'vitest';
import {
  LOSS_REWARD_BASE, LOSS_STREAK_MAX, LOSS_STREAK_STEP, PLANTED_LOSS_BONUS, WIN_REWARD, addMoney,
  canBuy, clampMoney, createInventory, killReward, lossReward, nextLossStreak, purchase,
  resetLoadout, roundReward,
} from './economy.js';
import { MAX_MONEY, START_MONEY } from './constants.js';

describe('economy rewards', () => {
  it('starts with $800', () => {
    expect(createInventory('CT').money).toBe(START_MONEY);
    expect(START_MONEY).toBe(800);
  });

  it('pays kill rewards per weapon class', () => {
    expect(killReward('ak47')).toBe(300);
    expect(killReward('mp5')).toBe(600);
    expect(killReward('awp')).toBe(100);
    expect(killReward('knife')).toBe(1500);
  });

  it('clamps money to 16000 and never below zero', () => {
    expect(addMoney(15000, 5000)).toBe(MAX_MONEY);
    expect(MAX_MONEY).toBe(16000);
    expect(addMoney(100, -500)).toBe(0);
    expect(clampMoney(NaN)).toBe(0);
  });

  it('grows the loss bonus with the streak up to a cap', () => {
    expect(lossReward(0)).toBe(LOSS_REWARD_BASE);
    expect(lossReward(1)).toBe(LOSS_REWARD_BASE + LOSS_STREAK_STEP);
    expect(lossReward(99)).toBe(LOSS_REWARD_BASE + LOSS_STREAK_MAX * LOSS_STREAK_STEP);
    expect(nextLossStreak(2, false)).toBe(3);
    expect(nextLossStreak(2, true)).toBe(0);
    expect(nextLossStreak(LOSS_STREAK_MAX, false)).toBe(LOSS_STREAK_MAX);
  });

  it('computes round rewards including the planted loss bonus', () => {
    expect(roundReward({ team: 'CT', won: true, lossStreak: 3, bombPlanted: false })).toBe(WIN_REWARD);
    expect(roundReward({ team: 'CT', won: false, lossStreak: 1, bombPlanted: true })).toBe(1900);
    expect(roundReward({ team: 'T', won: false, lossStreak: 0, bombPlanted: true })).toBe(LOSS_REWARD_BASE + PLANTED_LOSS_BONUS);
  });
});

describe('buying', () => {
  it('rejects purchases outside the buy phase', () => {
    const inv = createInventory('T');
    expect(canBuy(inv, 'deagle', false).code).toBe('buy_closed');
  });

  it('rejects unknown and team-restricted items', () => {
    const t = createInventory('T');
    t.money = 16000;
    expect(purchase(t, 'nothing', true).code).toBe('unknown_item');
    expect(purchase(t, 'm4a4', true).code).toBe('wrong_team');
    expect(purchase(t, 'kit', true).code).toBe('wrong_team');
    const ct = createInventory('CT');
    ct.money = 16000;
    expect(purchase(ct, 'ak47', true).code).toBe('wrong_team');
  });

  it('rejects purchases without enough money', () => {
    const inv = createInventory('T');
    const result = purchase(inv, 'ak47', true);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('no_money');
    expect(inv.money).toBe(800);
    expect(inv.primary).toBe(null);
  });

  it('deducts the price and replaces the slot weapon', () => {
    const inv = createInventory('T');
    inv.money = 5000;
    expect(purchase(inv, 'ak47', true).ok).toBe(true);
    expect(inv.primary).toBe('ak47');
    expect(inv.money).toBe(2300);
    expect(purchase(inv, 'ak47', true).code).toBe('owned');
    expect(purchase(inv, 'mp5', true).ok).toBe(true);
    expect(inv.primary).toBe('mp5');
    expect(purchase(inv, 'deagle', true).ok).toBe(true);
    expect(inv.secondary).toBe('deagle');
  });

  it('enforces grenade limits and armor/kit ownership', () => {
    const inv = createInventory('CT');
    inv.money = 10000;
    expect(purchase(inv, 'flash', true).ok).toBe(true);
    expect(purchase(inv, 'flash', true).ok).toBe(true);
    expect(purchase(inv, 'flash', true).code).toBe('limit');
    expect(purchase(inv, 'smoke', true).ok).toBe(true);
    expect(purchase(inv, 'smoke', true).code).toBe('limit');
    expect(purchase(inv, 'armor', true).ok).toBe(true);
    expect(inv.armor).toBe(100);
    expect(purchase(inv, 'armor', true).code).toBe('owned');
    expect(purchase(inv, 'kit', true).ok).toBe(true);
    expect(inv.hasKit).toBe(true);
    expect(purchase(inv, 'kit', true).code).toBe('owned');
  });

  it('resets the loadout on death', () => {
    const inv = createInventory('CT');
    inv.money = 9000;
    purchase(inv, 'm4a4', true);
    purchase(inv, 'armor', true);
    resetLoadout(inv);
    expect(inv.primary).toBe(null);
    expect(inv.armor).toBe(0);
    expect(inv.secondary).toBe('usp_s');
  });
});
