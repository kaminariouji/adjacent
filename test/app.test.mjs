// Handler-level tests: the same createApp() runs locally and in the Worker, so
// these assertions are what the hosted demo actually promises.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';

const post = (app, path, body) => app({ method: 'POST', path, body });

test('POST /api/cross shapes items with why and keeps a failed domain visible', async () => {
  const mock = {
    crossDomain: async () => ({
      'urn:entity:artist': [
        { id: 'a1', name: 'Demdike Stare', affinity: 0.82, explainability: { inputs: [{ id: 's1', score: 0.61 }] } },
      ],
      'urn:entity:movie': { error: 500, message: 'boom' },
    }),
  };
  const app = createApp({ client: null, mock });
  const res = await post(app, '/api/cross', { seeds: [{ id: 's1', label: 'Burial' }] });
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.source, 'fixture');
  assert.equal(body.seeds[0].label, 'Burial');
  assert.equal(body.domains['urn:entity:artist'].items[0].name, 'Demdike Stare');
  assert.deepEqual(body.domains['urn:entity:artist'].items[0].why, [{ id: 's1', label: 'Burial', score: 0.61 }]);
  assert.deepEqual(body.domains['urn:entity:movie'], { error: 500, items: [] });
});

test('POST /api/cross refuses an empty seed list instead of returning an empty showcase', async () => {
  const app = createApp({ client: null, mock: { crossDomain: async () => ({}) } });
  const res = await post(app, '/api/cross', { seeds: [] });
  assert.equal(res.status, 400);
  assert.match(JSON.parse(res.body).error, /at least one/);
});

test('a Qloo failure surfaces its real status, never a fabricated answer', async () => {
  const client = {
    crossDomain: async () => { const e = new Error('Qloo 401: bad key'); e.status = 401; throw e; },
  };
  const app = createApp({ client, mock: null });
  const res = await post(app, '/api/cross', { seeds: [{ id: 's1' }] });
  assert.equal(res.status, 502);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'qloo');
  assert.equal(body.status, 401);
});

test('GET /api/health reports the fixture source when there is no key', async () => {
  const app = createApp({ client: null, mock: { SAMPLE_CITY: 'Lisbon' } });
  const res = await app({ method: 'GET', path: '/api/health' });
  const body = JSON.parse(res.body);
  assert.equal(body.source, 'fixture');
  assert.equal(body.hasKey, false);
  assert.equal(body.sampleCity, 'Lisbon');
});

test('the fixture never serves Lisbon places for another city', async () => {
  const fixture = await import('../fixtures/lisbon.mjs');
  const app = createApp({ client: null, mock: fixture });
  const lisbon = JSON.parse((await post(app, '/api/plan', { seeds: [{ id: 'seed-burial', label: 'Burial' }], city: 'Lisbon' })).body);
  const tokyo = JSON.parse((await post(app, '/api/plan', { seeds: [{ id: 'seed-burial', label: 'Burial' }], city: 'Tokyo' })).body);
  assert.ok(lisbon.stops.length >= 4);
  assert.equal(lisbon.sampleCity, 'Lisbon');
  assert.equal(tokyo.stops.length, 0);
  assert.equal(tokyo.considered, 0);
  assert.equal(tokyo.sampleCity, 'Lisbon', 'the UI needs this to explain why the day is empty');
});
