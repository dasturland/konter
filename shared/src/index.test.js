import { describe, it, expect } from 'vitest';
import { GAME_NAME, TICK_RATE } from './index.js';

describe('shared smoke', () => {
  it('exports game constants', () => {
    expect(GAME_NAME).toBe('KONTR-STRAYK 3D');
    expect(TICK_RATE).toBe(30);
  });
});
