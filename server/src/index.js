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

/** Attaches the websocket endpoint to an http server. ws is loaded lazily. */
export async function attachWebSocket(server, manager) {
  const { WebSocketServer } = await import('ws');
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD });
  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });
  wss.on('connection', (ws) => {
    const client = manager.connect({
      send: (text) => { if (ws.readyState === 1) ws.send(text); },
      close: () => ws.close(),
    });
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
