// qloo.mjs — minimal client for the Qloo hackathon API.
// Contract (from docs.qloo.com, hackathon developer guide):
//   base   https://hackathon.api.qloo.com  (hackathon keys 401 on api.qloo.com)
//   auth   X-Api-Key: <key>                (not Bearer, not a query param)
//   reads  GET /search, GET /v2/tags, GET /v2/insights
//   never  /recommendations or /recs (legacy, unsupported)
//
// The client never invents data: a non-200 becomes a QlooError carrying the
// status and the body Qloo actually sent.

const DEFAULT_BASE = 'https://hackathon.api.qloo.com';

export class QlooError extends Error {
  constructor(status, body, url) {
    const msg = typeof body === 'string' ? body : JSON.stringify(body);
    super(`Qloo ${status}: ${msg.slice(0, 300)}`);
    this.name = 'QlooError';
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

/** Qloo returns entities under results.entities; older shapes put them at the top. */
export function entitiesOf(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.results?.entities)) return payload.results.entities;
  if (Array.isArray(payload.entities)) return payload.entities;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

/** Keep the fields the planner uses, so the UI never depends on Qloo's full shape. */
export function normaliseEntity(e) {
  const p = e.properties || {};
  return {
    id: e.id || e.entity_id || null,
    name: e.name || p.name || null,
    type: e.type || e.entity_type || null,
    subtype: e.subtype || p.subtype || null,
    image: p.image || null,
    description: p.description || null,
    city: p.geocode?.city || null,
    country: p.geocode?.country_code || null,
    lat: p.geocode?.latitude ?? e.location?.lat ?? p.latitude ?? null,
    lon: p.geocode?.longitude ?? e.location?.lon ?? p.longitude ?? null,
    // Live insights put the score under query.affinity; fixtures put it at the top.
    affinity: typeof e.affinity === 'number' ? e.affinity : typeof e.query?.affinity === 'number' ? e.query.affinity : null,
    tags: (Array.isArray(e.tags) ? e.tags : Array.isArray(p.tags) ? p.tags : []).slice(0, 8).map((t) => t.name || t),
    explainability: e.query?.explainability || e.explainability || null,
    raw: e,
  };
}

export class QlooClient {
  constructor({ apiKey, base = DEFAULT_BASE, fetchImpl = globalThis.fetch, timeout = 25000 } = {}) {
    if (!apiKey) throw new Error('QlooClient needs an apiKey');
    this.apiKey = apiKey;
    this.base = base.replace(/\/+$/, '');
    // Workers throws "Illegal invocation" when fetch is called detached from globalThis.
    this.fetch = fetchImpl.bind(globalThis);
    this.timeout = timeout;
  }

  async #get(path, params = {}) {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout);
    let res;
    try {
      res = await this.fetch(url.toString(), {
        headers: { 'X-Api-Key': this.apiKey, accept: 'application/json' },
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw new QlooError(0, `network: ${err.message}`, url.toString());
    }
    clearTimeout(timer);
    const text = await res.text();
    let body = text;
    try { body = JSON.parse(text); } catch { /* keep text */ }
    if (!res.ok) throw new QlooError(res.status, body, url.toString());
    return body;
  }

  /** /search → entity ids for a free-text name. */
  async search(query, { types, take = 8 } = {}) {
    const body = await this.#get('/search', { query, types, take });
    return entitiesOf(body).map(normaliseEntity);
  }

  /** /v2/tags → valid tag ids (filter.tags / signal.interests.tags need these). */
  async tags(query, { types, take = 10 } = {}) {
    const body = await this.#get('/v2/tags', { query, types, take });
    const list = body?.results?.tags || body?.tags || [];
    return list.map((t) => ({ id: t.id, name: t.name, type: t.type }));
  }

  /**
   * /v2/insights with filter.type=urn:tag — the "taste analysis" view.
   * Returns the tags that best describe the audience behind the seeds, which is
   * what turns a bare affinity number into something a person can read.
   */
  async tasteTags({ seeds = [], tagTypes, take = 8 } = {}) {
    if (!seeds.length) return [];
    const body = await this.#get('/v2/insights', {
      'filter.type': 'urn:tag',
      'filter.tag.types': tagTypes,
      'signal.interests.entities': seeds,
      take,
    });
    const list = body?.results?.tags || body?.tags || [];
    return list.map((t) => ({
      id: t.id || null,
      name: t.name || null,
      type: t.type || null,
      affinity: typeof t.affinity === 'number' ? t.affinity : null,
    })).filter((t) => t.name);
  }

  /**
   * The cross-domain jump: the same seeds, asked for in other media. This is the
   * claim Adjacent makes, so it is a first-class call rather than a UI trick.
   * Types are asked sequentially and each failure is reported, not hidden.
   */
  async crossDomain({ seeds = [], types = ['urn:entity:artist', 'urn:entity:movie', 'urn:entity:book'], take = 4 } = {}) {
    const out = {};
    for (const type of types) {
      try {
        const { entities } = await this.insights({ entityType: type, seeds, take });
        out[type] = entities;
      } catch (err) {
        out[type] = { error: err.status ?? 0, message: err.message };
      }
    }
    return out;
  }

  /**
   * /v2/insights — the only recommendation endpoint the hackathon key supports.
   * seeds: array of entity ids (signal.interests.entities).
   * city/country narrow the result set geographically.
   */
  async insights({
    entityType,
    seeds = [],
    city,
    country,
    take = 12,
    explainability = true,
    extra = {},
  } = {}) {
    if (!entityType) throw new Error('insights needs entityType');
    const params = {
      'filter.type': entityType,
      'signal.interests.entities': seeds,
      'filter.geocode.city': city,
      'filter.geocode.country_code': country,
      take,
      'feature.explainability': explainability ? 'true' : 'false',
      ...extra,
    };
    const body = await this.#get('/v2/insights', params);
    return {
      entities: entitiesOf(body).map(normaliseEntity),
      aggregate: body?.results?.query?.explainability || body?.query?.explainability || null,
      raw: body,
    };
  }
}
