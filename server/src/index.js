import { createServer } from 'node:http';
import { GAME_NAME } from '@konter/shared';

export const DEFAULT_PORT = 3000;

export function resolvePort(env = process.env) {
  const port = Number.parseInt(env.PORT ?? '', 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

export function createHttpServer() {
  return createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`${GAME_NAME} server`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = resolvePort();
  createHttpServer().listen(port, '0.0.0.0', () => {
    console.log(`${GAME_NAME} server: http://localhost:${port}`);
  });
}
