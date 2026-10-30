// Static file serving for client/dist with a single page app fallback.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
});

export function mimeFor(file) {
  return MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Maps a URL path to a file inside root. Returns null for traversal attempts.
 * Directories and extension-less paths resolve to index.html (SPA fallback).
 */
export function resolveStaticPath(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const base = resolve(root);
  const target = resolve(join(base, normalize(decoded)));
  if (target !== base && !target.startsWith(base + sep)) return null;
  return target;
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Creates a (req, res) handler serving files from root. Returns true when it handled the request. */
export function createStaticHandler(root) {
  const base = resolve(root);
  return async function serve(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }
    const target = resolveStaticPath(base, req.url ?? '/');
    if (target === null) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }
    let file = target;
    if (!(await isFile(file))) {
      if (extname(file) !== '') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      file = join(base, 'index.html');
      if (!(await isFile(file))) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Client build not found. Run: npm run build');
        return;
      }
    }
    const headers = { 'Content-Type': mimeFor(file), 'X-Content-Type-Options': 'nosniff' };
    headers['Cache-Control'] = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  };
}
