// MCP layer: an agent must be able to discover the tools, then chain them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';
import { createMcp, PROTOCOL_VERSION } from '../src/mcp.mjs';
import * as fixture from '../fixtures/lisbon.mjs';

function server() {
  const app = createApp({ client: null, mock: fixture });
  return { app, mcp: createMcp({ search: app.search, plan: app.plan, cross: app.cross }) };
}

test('initialize advertises the tools capability and a usable protocol version', async () => {
  const { mcp } = server();
  const out = await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(out.id, 1);
  assert.equal(out.result.protocolVersion, PROTOCOL_VERSION);
  assert.deepEqual(out.result.capabilities, { tools: {} });
  assert.equal(out.result.serverInfo.name, 'adjacent');
});

test('notifications get no JSON-RPC body (the transport answers 202)', async () => {
  const { mcp } = server();
  assert.equal(await mcp({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('tools/list exposes find_entities, plan_day and cross_media with schemas', async () => {
  const { mcp } = server();
  const out = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = out.result.tools.map((t) => t.name);
  assert.deepEqual(names, ['find_entities', 'plan_day', 'cross_media']);
  for (const t of out.result.tools) {
    assert.equal(t.inputSchema.type, 'object');
    assert.ok(t.description.length > 40, `${t.name} needs a description a model can act on`);
  }
  assert.deepEqual(out.result.tools[1].inputSchema.required, ['seeds', 'city']);
});

test('an agent can chain find_entities into plan_day', async () => {
  const { mcp } = server();
  const found = await mcp({
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'find_entities', arguments: { query: 'Burial' } },
  });
  assert.equal(found.result.isError, false);
  const results = found.result.structuredContent.results;
  assert.ok(results.length > 0);
  assert.equal(results[0].id, 'seed-burial');

  const planned = await mcp({
    jsonrpc: '2.0', id: 4, method: 'tools/call',
    params: { name: 'plan_day', arguments: { seeds: [{ id: results[0].id, label: results[0].name }], city: 'Lisbon' } },
  });
  assert.equal(planned.result.isError, false);
  const plan = planned.result.structuredContent;
  assert.equal(plan.source, 'fixture');
  assert.ok(plan.stops.length >= 4);
  assert.equal(plan.stops[0].why[0].label, 'Burial');
  assert.equal(typeof planned.result.content[0].text, 'string');
});

test('a tool failure is a result the model can read, not a transport error', async () => {
  const { mcp } = server();
  const out = await mcp({
    jsonrpc: '2.0', id: 5, method: 'tools/call',
    params: { name: 'plan_day', arguments: { seeds: [{ id: 'seed-burial' }] } },
  });
  assert.equal(out.result.isError, true);
  assert.match(out.result.content[0].text, /city is required/);
  assert.equal(out.error, undefined);
});

test('cross_media returns all three domains from the same handler the web page uses', async () => {
  const { mcp } = server();
  const out = await mcp({
    jsonrpc: '2.0', id: 6, method: 'tools/call',
    params: { name: 'cross_media', arguments: { seeds: [{ id: 'seed-bolano', label: 'Bolaño' }] } },
  });
  const domains = out.result.structuredContent.domains;
  assert.deepEqual(Object.keys(domains).sort(), ['urn:entity:artist', 'urn:entity:book', 'urn:entity:movie']);
  assert.equal(domains['urn:entity:book'].items[0].name, '2666');
});

test('unknown method and unknown tool are JSON-RPC errors, not crashes', async () => {
  const { mcp } = server();
  const m = await mcp({ jsonrpc: '2.0', id: 7, method: 'resources/list' });
  assert.equal(m.error.code, -32601);
  const t = await mcp({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'nope' } });
  assert.equal(t.error.code, -32602);
});
