// app.mjs — transport-agnostic request handler shared by the local Node server
// and the Cloudflare Worker. It owns no sockets, so the same code is what runs
// in the hosted demo.
import { buildPlan, explain } from './plan.mjs';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

const json = (status, body) => ({ status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }, body: JSON.stringify(body) });

export function createApp({ client, mock = null }) {
  const q = client;

  async function search(term, types) {
    if (mock) return mock.search(term, types);
    return q.search(term, { types, take: 6 });
  }

  async function plan({ seeds, city, country }) {
    if (!Array.isArray(seeds) || seeds.length === 0) return json(400, { error: 'pick at least one thing you love' });
    if (!city || typeof city !== 'string') return json(400, { error: 'city is required' });
    const seedIds = seeds.map((s) => s.id).filter(Boolean);
    if (seedIds.length === 0) return json(400, { error: 'seeds need ids' });
    const seedLabels = Object.fromEntries(seeds.map((s) => [s.id, s.label || s.name || s.id]));

    let entities;
    try {
      if (mock) entities = await mock.insights({ city, seeds: seedIds });
      else {
        const res = await q.insights({ entityType: 'urn:entity:place', seeds: seedIds, city, country, take: 40 });
        entities = res.entities;
      }
    } catch (err) {
      // Surface the real status; never fall back to a fabricated day.
      return json(502, { error: 'qloo', status: err.status ?? null, message: err.message });
    }
    // Best-effort: the tag layer explains *why* the seeds cluster. A failure
    // here must not take the day down, so it is reported as null, never faked.
    let taste = null;
    try {
      taste = mock ? await mock.tasteTags({ seeds: seedIds }) : await q.tasteTags({ seeds: seedIds, take: 8 });
    } catch {
      taste = null;
    }

    const built = buildPlan({ entities, city, seedLabels });
    return json(200, {
      city,
      seeds: seeds.map((s) => ({ id: s.id, label: s.label || s.name || s.id })),
      stops: built.stops.map((s) => ({
        slot: s.slot,
        slotLabel: s.slotLabel,
        score: s.score,
        why: s.why,
        entity: {
          id: s.entity.id,
          name: s.entity.name,
          subtype: s.entity.subtype,
          image: s.entity.image,
          description: s.entity.description,
          city: s.entity.city,
          lat: s.entity.lat,
          lon: s.entity.lon,
          tags: s.entity.tags,
        },
      })),
      gaps: built.gaps,
      taste,
      considered: built.considered,
      source: mock ? 'fixture' : 'qloo',
    });
  }

  async function cross({ seeds }) {
    if (!Array.isArray(seeds) || seeds.length === 0) return json(400, { error: 'pick at least one thing you love' });
    const seedIds = seeds.map((s) => s.id).filter(Boolean);
    if (!seedIds.length) return json(400, { error: 'seeds need ids' });
    const seedLabels = Object.fromEntries(seeds.map((s) => [s.id, s.label || s.name || s.id]));
    let raw;
    try {
      raw = mock ? await mock.crossDomain({ seeds: seedIds }) : await q.crossDomain({ seeds: seedIds, take: 4 });
    } catch (err) {
      return json(502, { error: 'qloo', status: err.status ?? null, message: err.message });
    }
    const shaped = {};
    for (const [type, value] of Object.entries(raw)) {
      if (!Array.isArray(value)) { shaped[type] = { error: value.error ?? null, items: [] }; continue; }
      shaped[type] = {
        items: value.slice(0, 4).map((e) => ({
          id: e.id, name: e.name, image: e.image, affinity: e.affinity,
          why: explain(e, seedLabels),
        })),
      };
    }
    return json(200, { seeds: seeds.map((s) => ({ id: s.id, label: s.label || s.name || s.id })), domains: shaped, source: mock ? 'fixture' : 'qloo' });
  }

  return async function handle({ method, path, query = {}, body = null }) {
    if (method === 'OPTIONS') return { status: 204, headers: CORS, body: '' };
    if (method === 'GET' && path === '/api/health') return json(200, { ok: true, source: mock ? 'fixture' : 'qloo', hasKey: !mock });
    if (method === 'GET' && path === '/api/search') {
      const term = (query.q || '').trim();
      if (term.length < 2) return json(400, { error: 'q must be at least 2 characters' });
      try {
        return json(200, { results: await search(term, query.types) });
      } catch (err) {
        return json(502, { error: 'qloo', status: err.status ?? null, message: err.message });
      }
    }
    if (method === 'POST' && path === '/api/plan') return plan(body || {});
    if (method === 'POST' && path === '/api/cross') return cross(body || {});
    return json(404, { error: 'not found' });
  };
}
