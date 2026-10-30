import { describe, it, expect } from 'vitest';
import { resolvePort, DEFAULT_PORT } from './index.js';

describe('server smoke', () => {
  it('uses PORT env when valid', () => {
    expect(resolvePort({ PORT: '8080' })).toBe(8080);
  });
  it('falls back to default port', () => {
    expect(resolvePort({ PORT: 'abc' })).toBe(DEFAULT_PORT);
    expect(resolvePort({})).toBe(DEFAULT_PORT);
  });
});
