import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GAME_NAME } from '@konter/shared';
import { RoomManager } from './rooms.js';
import { createStaticHandler } from './httpStatic.js';

export const DEFAULT_PORT = 3000;
export const WS_PATH = '/ws';
export const MAX_WS_PAYLOAD = 2048;

export function resolvePort(env = process.env) {
  const port = Number.parseInt(env.PORT ?? '', 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

export function defaultDistDir() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
}

/** HTTP server: /health, and the built client from client/dist in production. */
export function createHttpServer({ distDir = defaultDistDir(), manager = null } = {}) {
  const serveStatic = createStaticHandler(distDir);
  return createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        ok: true, game: GAME_NAME, rooms: manager ? manager.roomCount : 0, players: manager ? manager.playerCount : 0,
      }));
      return;
    }
    serveStatic(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error');
    });
  });
}

/** Client address; X-Forwarded-For is trusted only when TRUST_PROXY=1 (server sits behind a proxy). */
export function clientIp(req, env = process.env) {
  if (env.TRUST_PROXY === '1') {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress ?? '';
}

/**
 * Accepts requests without an Origin header (non-browser clients) and browsers whose Origin host
 * matches the Host header or is listed in ALLOWED_ORIGINS (comma separated origins).
 */
export function isOriginAllowed(req, env = process.env) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** Attaches the websocket endpoint to an http server. ws is loaded lazily. */
export async function attachWebSocket(server, manager) {
  const { WebSocketServer } = await import('ws');
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD });
  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) { socket.destroy(); return; }
    if (!isOriginAllowed(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const ip = clientIp(req);
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, ip));
  });
  wss.on('connection', (ws, ip) => {
    const client = manager.connect({
      ip,
      send: (text) => { if (ws.readyState === 1) ws.send(text); },
      close: () => ws.close(),
    });
    if (!client) { ws.close(1013, 'busy'); return; }
    ws.on('message', (data, isBinary) => {
      if (isBinary) { manager.reject(client, 'bad_message'); return; }
      manager.handleMessage(client, data.toString('utf8'));
    });
    ws.on('close', () => manager.handleClose(client));
    ws.on('error', () => ws.terminate());
  });
  return wss;
}

export async function startServer({ port = resolvePort(), distDir = defaultDistDir() } = {}) {
  const manager = new RoomManager();
  const server = createHttpServer({ distDir, manager });
  await attachWebSocket(server, manager);
  manager.start();
  await new Promise((resolveListen) => server.listen(port, '0.0.0.0', resolveListen));
  console.log(`${GAME_NAME} server: http://localhost:${port}`);
  return { server, manager };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
