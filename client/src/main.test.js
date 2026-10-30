import { describe, it, expect } from 'vitest';
import { GAME_NAME } from '@konter/shared';

describe('client smoke', () => {
  it('sees the shared module', () => {
    expect(GAME_NAME).toContain('KONTR');
  });
});
