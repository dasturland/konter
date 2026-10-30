import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpServer } from './index.js';
import { mimeFor, resolveStaticPath } from './httpStatic.js';
import { RoomManager } from './rooms.js';

describe('static paths', () => {
  it('maps mime types', () => {
    expect(mimeFor('a.js')).toMatch(/javascript/);
    expect(mimeFor('a.css')).toMatch(/css/);
    expect(mimeFor('a.unknown')).toBe('application/octet-stream');
  });

  it('blocks path traversal', () => {
    expect(resolveStaticPath('/srv/dist', '/../secret')).toBe(join('/srv/dist', 'secret'));
    expect(resolveStaticPath('/srv/dist', '/%2e%2e/%2e%2e/etc/passwd')).toBe(join('/srv/dist', 'etc', 'passwd'));
    expect(resolveStaticPath('/srv/dist', '/%zz')).toBeNull();
    expect(resolveStaticPath('/srv/dist', '/a\0b')).toBeNull();
    expect(resolveStaticPath('/srv/dist', '/assets/x.js')).toBe(join('/srv/dist', 'assets', 'x.js'));
  });
});

describe('http server', () => {
  async function start() {
    const dir = mkdtempSync(join(tmpdir(), 'konter-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<h1>KONTR</h1>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    const server = createHttpServer({ distDir: dir, manager: new RoomManager() });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return { server, base: `http://127.0.0.1:${server.address().port}` };
  }

  it('serves health, files and the SPA fallback', async () => {
    const { server, base } = await start();
    try {
      const health = await (await fetch(`${base}/health`)).json();
      expect(health.ok).toBe(true);
      const index = await fetch(`${base}/`);
      expect(await index.text()).toBe('<h1>KONTR</h1>');
      const js = await fetch(`${base}/assets/app.js`);
      expect(js.headers.get('content-type')).toMatch(/javascript/);
      const spa = await fetch(`${base}/lobby/abc`);
      expect(spa.status).toBe(200);
      expect(await spa.text()).toBe('<h1>KONTR</h1>');
      expect((await fetch(`${base}/missing.js`)).status).toBe(404);
    } finally {
      server.close();
    }
  });
});
