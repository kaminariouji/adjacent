// worker.mjs — Cloudflare Worker entry. Same handler as the local server; the
// only difference is where the Qloo key comes from (a Worker secret).
import { createApp } from './app.mjs';
import { QlooClient } from './qloo.mjs';
import * as fixture from '../fixtures/lisbon.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const client = env.QLOO_API_KEY ? new QlooClient({ apiKey: env.QLOO_API_KEY }) : null;
    const app = createApp({ client, mock: client ? null : fixture });

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
