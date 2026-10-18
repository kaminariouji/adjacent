// mcp.mjs — Model Context Protocol server, JSON-RPC 2.0 over HTTP POST.
//
// Why this exists: the hackathon asks for something an agent can *use*. The
// same taste graph that powers the web page is exposed here as three tools an
// MCP client can call in sequence — find_entities → plan_day → cross_media.
// The transport returns application/json, which the Streamable HTTP transport
// permits for request/response exchanges.

export const PROTOCOL_VERSION = '2025-06-18';

const SEEDS_SCHEMA = {
  type: 'array',
  minItems: 1,
  description: 'Things the user already loves, as returned by find_entities.',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Qloo entity id' },
      label: { type: 'string', description: 'Human name, echoed back in the reasons' },
    },
    required: ['id'],
  },
};

export function createMcp({ search, plan, cross }) {
  const tools = [
    {
      name: 'find_entities',
      description:
        'Resolve a free-text name ("Burial", "Wong Kar-wai", "Ichiran") to Qloo entity ids. Call this first: the other two tools need ids, not names.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 2, description: 'Name of a musician, film, place, person, brand…' },
          types: { type: 'string', description: 'Optional Qloo entity type filter, e.g. urn:entity:artist' },
        },
        required: ['query'],
      },
    },
    {
      name: 'plan_day',
      description:
        'Build a five-stop day (morning, lunch, afternoon, evening, late) in a city from things the user loves. Every stop carries Qloo explainability mapped back to the seeds; slots Qloo cannot fill are returned as named gaps, never padded.',
      inputSchema: {
        type: 'object',
        properties: {
          seeds: SEEDS_SCHEMA,
          city: { type: 'string', description: 'City to plan in, e.g. "Lisbon"' },
        },
        required: ['seeds', 'city'],
      },
    },
    {
      name: 'cross_media',
      description:
        'Ask the same taste for artists, films and books. Use when the user wants a recommendation outside the city/day frame, or to justify why a pick fits. A media type Qloo cannot answer is returned as an error, not a guess.',
      inputSchema: {
        type: 'object',
        properties: { seeds: SEEDS_SCHEMA },
        required: ['seeds'],
      },
    },
  ];

  const run = {
    find_entities: async (args) => {
      const results = await search(args.query, args.types);
      return { results };
    },
    plan_day: async (args) => unwrap(await plan(args)),
    cross_media: async (args) => unwrap(await cross(args)),
  };

  /** app.mjs returns HTTP-shaped responses; the tool layer wants data or an error. */
  function unwrap(res) {
    const body = JSON.parse(res.body);
    if (res.status !== 200) {
      const err = new Error(body.message || body.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  return async function handle(req) {
    const { id = null, method, params = {} } = req || {};
    const ok = (result) => ({ jsonrpc: '2.0', id, result });
    const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

    if (method === 'initialize') {
      return ok({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'adjacent', version: '0.2.0' },
        instructions:
          'Adjacent turns things a person already loves into a day in a city, plus the same taste in other media. Call find_entities first, then plan_day or cross_media with the ids.',
      });
    }
    // Notifications carry no id and expect no JSON-RPC response.
    if (typeof method === 'string' && method.startsWith('notifications/')) return null;
    if (method === 'ping') return ok({});
    if (method === 'tools/list') return ok({ tools });

    if (method === 'tools/call') {
      const name = params.name;
      if (!run[name]) return fail(-32602, `unknown tool: ${name}`);
      try {
        const data = await run[name](params.arguments || {});
        return ok({
          content: [{ type: 'text', text: JSON.stringify(data) }],
          structuredContent: data,
          isError: false,
        });
      } catch (err) {
        // A tool failure is a result the model can read, not a transport error.
        return ok({
          content: [{ type: 'text', text: err.message || String(err) }],
          isError: true,
        });
      }
    }

    return fail(-32601, `method not found: ${method}`);
  };
}
