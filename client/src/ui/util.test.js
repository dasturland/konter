import { describe, it, expect } from 'vitest';
import { buyList } from '@konter/shared';
import { formatTime, formatMoney, menuCategory, CATEGORY_TITLES, reasonText } from './util.js';

describe('formatting', () => {
  it('formats the round clock as m:ss and never goes negative', () => {
    expect(formatTime(115)).toBe('1:55');
    expect(formatTime(5.2)).toBe('0:06');
    expect(formatTime(-3)).toBe('0:00');
  });

  it('formats money with a dollar sign', () => {
    expect(formatMoney(800)).toBe('$800');
    expect(formatMoney(-5)).toBe('$0');
  });

  it('has an Uzbek text for every round end reason', () => {
    for (const r of ['eliminated', 'exploded', 'defused', 'time']) expect(reasonText(r).length).toBeGreaterThan(3);
    expect(reasonText('nope')).toBe('');
  });
});

describe('buy menu categories', () => {
  it('maps every purchasable item of both teams into a titled tab', () => {
    for (const team of ['CT', 'T']) {
      for (const w of buyList(team)) {
        expect(CATEGORY_TITLES[menuCategory(w)]).toBeDefined();
      }
    }
    expect(menuCategory({ category: 'rifle' })).toBe('automat');
    expect(menuCategory({ category: 'smg' })).toBe('automat');
  });
});
