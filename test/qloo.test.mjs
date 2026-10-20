// Contract test: a fake Qloo instance that enforces the request shape the
// hackathon key expects, so the client cannot drift from the documented API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { QlooClient, QlooError, entitiesOf, normaliseEntity } from '../src/qloo.mjs';

function fakeQloo(handler) {
  const seen = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const rec = { path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers };
    seen.push(rec);
    const out = handler(rec);
    res.writeHead(out.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out.body));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, seen, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('search sends X-Api-Key and parses results.entities', async () => {
  const { server, seen, base } = await fakeQloo(() => ({
    status: 200,
    body: { results: { entities: [{ id: 'uuid-1', name: 'Burial', type: 'urn:entity:artist', properties: { image: 'x.jpg' } }] } },
  }));
  const c = new QlooClient({ apiKey: 'k-123', base });
  const out = await c.search('Burial', { types: 'urn:entity:artist' });
  server.close();
  assert.equal(out[0].id, 'uuid-1');
  assert.equal(out[0].name, 'Burial');
  assert.equal(seen[0].headers['x-api-key'], 'k-123');
  assert.equal(seen[0].headers.authorization, undefined, 'must not send Authorization');
  assert.equal(seen[0].query.query, 'Burial');
  assert.equal(seen[0].query.types, 'urn:entity:artist');
});

test('insights joins seeds with commas and asks for explainability', async () => {
  const { server, seen, base } = await fakeQloo(() => ({
    status: 200,
    body: { results: { entities: [{ id: 'p1', name: 'Cafe A', type: 'urn:entity:place', properties: { geocode: { city: 'Lisbon', country_code: 'PT', latitude: 38.7, longitude: -9.1 } } }] } },
  }));
  const c = new QlooClient({ apiKey: 'k', base });
  const out = await c.insights({ entityType: 'urn:entity:place', seeds: ['a', 'b'], city: 'Lisbon', take: 5 });
  server.close();
  assert.equal(seen[0].path, '/v2/insights');
  assert.equal(seen[0].query['filter.type'], 'urn:entity:place');
  assert.equal(seen[0].query['signal.interests.entities'], 'a,b');
  assert.equal(seen[0].query['filter.location.query'], 'Lisbon');
  assert.equal(seen[0].query['filter.geocode.city'], undefined, 'a bare city name is not a geocode filter');
  assert.equal(seen[0].query['feature.explainability'], 'true');
  assert.equal(seen[0].query.take, '5');
  assert.equal(out.entities[0].city, 'Lisbon');
  assert.equal(out.entities[0].lat, 38.7);
});

test('non-200 becomes a QlooError carrying status and body', async () => {
  const { server, base } = await fakeQloo(() => ({ status: 401, body: { message: 'invalid key' } }));
  const c = new QlooClient({ apiKey: 'bad', base });
  await assert.rejects(() => c.search('x'), (err) => {
    assert.ok(err instanceof QlooError);
    assert.equal(err.status, 401);
    assert.match(err.message, /invalid key/);
    return true;
  });
  server.close();
});

test('network failure becomes status 0, not a fake result', async () => {
  const c = new QlooClient({ apiKey: 'k', base: 'http://127.0.0.1:9', timeout: 1500 });
  await assert.rejects(() => c.search('x'), (err) => err instanceof QlooError && err.status === 0);
});

test('missing apiKey fails loudly at construction', () => {
  assert.throws(() => new QlooClient({}), /needs an apiKey/);
});

test('tags reads results.tags', async () => {
  const { server, seen, base } = await fakeQloo(() => ({ status: 200, body: { results: { tags: [{ id: 't1', name: 'jazz', type: 'urn:tag:genre:music' }] } } }));
  const c = new QlooClient({ apiKey: 'k', base });
  const out = await c.tags('jazz');
  server.close();
  assert.equal(out[0].name, 'jazz');
  assert.equal(seen[0].path, '/v2/tags');
});

test('entitiesOf tolerates both response shapes and never invents rows', () => {
  assert.deepEqual(entitiesOf({ results: { entities: [{ id: 1 }] } }), [{ id: 1 }]);
  assert.deepEqual(entitiesOf({ entities: [{ id: 2 }] }), [{ id: 2 }]);
  assert.deepEqual(entitiesOf({ results: { tags: [] } }), []);
  assert.deepEqual(entitiesOf(null), []);
});

test('normaliseEntity keeps explainability and tags, drops the rest', () => {
  const n = normaliseEntity({
    id: 'x', name: 'Y', type: 'urn:entity:place',
    properties: { image: 'i', geocode: { city: 'Porto' }, tags: [{ name: 'wine' }, 'tapas'] },
    query: { explainability: { inputs: [{ id: 'seed', score: 0.42 }] } },
  });
  assert.equal(n.city, 'Porto');
  assert.deepEqual(n.tags, ['wine', 'tapas']);
  assert.equal(n.explainability.inputs[0].score, 0.42);
});

test('tasteTags asks for urn:tag insights and reads results.tags', async () => {
  const { server, seen, base } = await fakeQloo(() => ({
    status: 200,
    body: { results: { tags: [{ id: 't1', name: 'dub techno', affinity: 0.71 }, { name: 'nocturnal' }] } },
  }));
  const c = new QlooClient({ apiKey: 'k', base });
  const out = await c.tasteTags({ seeds: ['a', 'b'] });
  server.close();
  assert.equal(seen[0].query['filter.type'], 'urn:tag');
  assert.equal(seen[0].query['signal.interests.entities'], 'a,b');
  assert.deepEqual(out.map((t) => t.name), ['dub techno', 'nocturnal']);
  assert.equal(out[0].affinity, 0.71);
});

test('tasteTags with no seeds makes no request at all', async () => {
  const c = new QlooClient({ apiKey: 'k', base: 'http://127.0.0.1:9', timeout: 500 });
  assert.deepEqual(await c.tasteTags({ seeds: [] }), []);
});

test('crossDomain asks one insights call per media type and keys results by type', async () => {
  const { server, seen, base } = await fakeQloo((rec) => ({
    status: 200,
    body: { results: { entities: [{ id: `${rec.query['filter.type']}-1`, name: 'X' }] } },
  }));
  const c = new QlooClient({ apiKey: 'k', base });
  const out = await c.crossDomain({ seeds: ['s1'], types: ['urn:entity:artist', 'urn:entity:movie'] });
  server.close();
  assert.deepEqual(seen.map((s) => s.query['filter.type']), ['urn:entity:artist', 'urn:entity:movie']);
  assert.equal(seen[0].query['signal.interests.entities'], 's1');
  assert.equal(out['urn:entity:artist'][0].id, 'urn:entity:artist-1');
  assert.equal(out['urn:entity:movie'][0].id, 'urn:entity:movie-1');
});

test('crossDomain reports a failed domain instead of hiding it', async () => {
  const { server, base } = await fakeQloo((rec) => (
    rec.query['filter.type'] === 'urn:entity:movie'
      ? { status: 500, body: { message: 'boom' } }
      : { status: 200, body: { results: { entities: [{ id: 'a1', name: 'A' }] } } }
  ));
  const c = new QlooClient({ apiKey: 'k', base });
  const out = await c.crossDomain({ seeds: ['s'], types: ['urn:entity:artist', 'urn:entity:movie'] });
  server.close();
  assert.equal(out['urn:entity:artist'][0].name, 'A');
  assert.equal(out['urn:entity:movie'].error, 500);
  assert.match(out['urn:entity:movie'].message, /boom/);
});
