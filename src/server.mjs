// server.mjs — local dev server. Serves public/ and mounts the shared handler.
//   QLOO_API_KEY=... node src/server.mjs        # live
//   QLOO_MOCK=1 node src/server.mjs             # fixture
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
import { createMcp } from './mcp.mjs';
import { QlooClient } from './qloo.mjs';
import * as fixture from '../fixtures/lisbon.mjs';

const MOCK = process.env.QLOO_MOCK === '1' || !process.env.QLOO_API_KEY;
const PORT = Number(process.env.PORT || 8123);
const ROOT = fileURLToPath(new URL('../public/', import.meta.url));

const client = MOCK ? null : new QlooClient({ apiKey: process.env.QLOO_API_KEY });
const app = createApp({ client, mock: MOCK ? fixture : null });
const mcp = createMcp({ search: app.search, plan: app.plan, cross: app.cross });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return null; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/mcp') {
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain' });
      res.end('POST JSON-RPC 2.0 here');
      return;
    }
    const out = await mcp(await readJson(req));
    if (!out) { res.writeHead(202); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(out));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    let body = null;
    if (req.method === 'POST') body = await readJson(req);
    const out = await app({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
    res.writeHead(out.status, out.headers);
    res.end(out.body);
    return;
  }
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`adjacent on http://127.0.0.1:${PORT} · source=${MOCK ? 'fixture' : 'qloo'}`);
});
