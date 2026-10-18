// worker.mjs — Cloudflare Worker entry. Same handler as the local server; the
// only difference is where the Qloo key comes from (a Worker secret).
import { createApp } from './app.mjs';
import { createMcp } from './mcp.mjs';
import { QlooClient } from './qloo.mjs';
import * as fixture from '../fixtures/lisbon.mjs';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isMcp = url.pathname === '/mcp';
    if (!isMcp && !url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const client = env.QLOO_API_KEY ? new QlooClient({ apiKey: env.QLOO_API_KEY }) : null;
    const app = createApp({ client, mock: client ? null : fixture });

    if (isMcp) {
      if (request.method === 'GET') {
        return new Response('Adjacent MCP endpoint — POST JSON-RPC 2.0 here (initialize, tools/list, tools/call).', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8', allow: 'POST' },
        });
      }
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
      const body = await request.json().catch(() => null);
      const out = await createMcp({ search: app.search, plan: app.plan, cross: app.cross })(body);
      if (!out) return new Response(null, { status: 202 });
      return new Response(JSON.stringify(out), { status: 200, headers: JSON_HEADERS });
    }

    let body = null;
    if (request.method === 'POST') {
      body = await request.json().catch(() => ({}));
    }
    const out = await app({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
    });
    return new Response(out.body, { status: out.status, headers: out.headers });
  },
};
