import { describe, it, expect } from 'vitest';
import { resolvePort, DEFAULT_PORT, isOriginAllowed, clientIp } from './index.js';

describe('server smoke', () => {
  it('uses PORT env when valid', () => {
    expect(resolvePort({ PORT: '8080' })).toBe(8080);
  });
  it('falls back to default port', () => {
    expect(resolvePort({ PORT: 'abc' })).toBe(DEFAULT_PORT);
    expect(resolvePort({})).toBe(DEFAULT_PORT);
  });
});

describe('origin and address checks', () => {
  const req = (headers, remote = '1.2.3.4') => ({ headers, socket: { remoteAddress: remote } });
  it('accepts same host, missing origin and allow-listed origins', () => {
    expect(isOriginAllowed(req({ host: 'a.test:3000', origin: 'http://a.test:3000' }), {})).toBe(true);
    expect(isOriginAllowed(req({ host: 'a.test' }), {})).toBe(true);
    expect(isOriginAllowed(req({ host: 'a.test', origin: 'https://b.test' }), { ALLOWED_ORIGINS: 'https://b.test' })).toBe(true);
  });
  it('rejects foreign or malformed origins', () => {
    expect(isOriginAllowed(req({ host: 'a.test', origin: 'https://evil.test' }), {})).toBe(false);
    expect(isOriginAllowed(req({ host: 'a.test', origin: 'not a url' }), {})).toBe(false);
  });
  it('uses X-Forwarded-For only when TRUST_PROXY=1', () => {
    const r = req({ 'x-forwarded-for': '5.6.7.8, 9.9.9.9' });
    expect(clientIp(r, {})).toBe('1.2.3.4');
    expect(clientIp(r, { TRUST_PROXY: '1' })).toBe('5.6.7.8');
  });
});
