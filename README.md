# Adjacent

**A city that fits you.** Pick a few things you love — a musician, a film, a restaurant — and Adjacent builds a day in a city you have not visited, with the taste evidence behind every stop.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

**Live demo:** https://adjacent.ojikaminari.workers.dev — runs on fixture data until the hackathon API key arrives; the badge in the header always says which source you are looking at.

## The idea

Travel recommendations usually ask what you want to *do*. Adjacent asks what you already *love*, in any domain, and then moves that taste sideways: a Burial listener's next cocktail bar, a Wong Kar-wai fan's next gallery, an Ichiran regular's next lunch. The interesting question is not "what is popular in Lisbon" but "what in Lisbon is popular with people like you".

Qloo's taste graph is the only reason this works. A generic LLM would answer with the same ten tourist places for everyone.

## Who this is for

- **The traveller with specific taste and three days.** They do not want "top 10 Lisbon". They want the record shop that a Burial fan and a Wong Kar-wai fan both end up in. Today they get that by asking a friend with the same taste, or by scrolling a forum for an hour.
- **The city-break planner who has already been everywhere obvious.** The value is not discovery of a city, it is discovery of *their* corner of it.
- **The agent builder.** An assistant that plans trips has no cultural grounding; it hallucinates a restaurant. `POST /mcp` gives it one call that returns places *and* the evidence for each.

What all three share: the answer depends on cross-domain taste, and the evidence has to be checkable. That is exactly what a taste graph provides and what a language model cannot.

## Why it cannot work without Qloo

Ask an LLM for "a bar for someone who likes Burial and Wong Kar-wai" and it will produce a plausible paragraph with no source. Ask Adjacent and you get a place, an affinity number, and the share of that affinity that came from Burial — a number the user can disagree with. Remove Qloo and the product has nothing to show but prose.

The cross-media panel makes the same point in the other direction: the same three seeds return artists, films and books, and a domain Qloo cannot answer stays empty instead of being filled with titles that sound right.

## What makes the reasons real

Every card shows chips like `because you love Burial · 0.52`. Those numbers are not generated text — they come from Qloo's own explainability payload (`feature.explainability=true`), which reports which input entities contributed to a recommendation and with what normalised weight.

Two rules follow from that, and both are enforced in code:

- If Qloo returns no explanation for a place, the card shows **no reason**. It never writes a plausible-sounding one.
- If Qloo returns fewer places than the day has slots, the plan is **shorter and names the gaps**. It never pads the day with filler.

A tool that explains itself has to be honest about the parts it cannot explain.

## Adjacent in other media

The day is only half the claim. `POST /api/cross` asks the same seeds for artists, films and books, so a jazz listener can see the records, the films and the novels that sit next to their taste. Each domain is a separate `/v2/insights` call; if one domain fails, that column says so and the other two still render. No column is ever filled with invented titles.

## Agent interface (MCP)

The hackathon asks for something an agent can *use*, so the taste logic is exposed as an MCP server at `POST /mcp` (JSON-RPC 2.0, `application/json` responses — the Streamable HTTP transport allows this for request/response exchanges).

Three tools, meant to be chained:

| Tool | What it does |
|---|---|
| `find_entities` | free-text name → Qloo entity ids (call this first) |
| `plan_day` | seeds + city → five stops with reasons, plus named gaps |
| `cross_media` | seeds → artists, films, books that share the audience |

```bash
curl -s https://adjacent.ojikaminari.workers.dev/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"plan_day","arguments":{"seeds":[{"id":"<qloo-id>","label":"Burial"}],"city":"Lisbon"}}}'
```

`initialize`, `tools/list`, `tools/call` and `ping` are implemented; notifications return `202` with no body. A tool failure comes back as `isError: true` with the real message, so the model can read it instead of the transport breaking.

A real session — requests and raw responses, nothing hand-written — is in [`demo/agent-session.md`](demo/agent-session.md).

## Run it

```bash
npm test                 # contract + planner tests, no network
npm run start:mock       # http://127.0.0.1:8123 with bundled fixture data
QLOO_API_KEY=... npm start   # live Qloo
```

`QLOO_MOCK=1` forces the fixture; without a key the server falls back to it automatically and the UI badge reads `fixture data`.

## How it talks to Qloo

```
base    https://hackathon.api.qloo.com
auth    X-Api-Key: <key>
reads   GET /search          → entity ids for a free-text name
        GET /v2/insights     → places that share audience with your seeds
        GET /v2/tags         → valid tag ids
never   /recommendations, /recs (legacy, unsupported by hackathon keys)
```

The planner request:

```
GET /v2/insights
  ?filter.type=urn:entity:place
  &signal.interests.entities=<seed ids, comma separated>
  &filter.geocode.city=<city>
  &take=40
  &feature.explainability=true
```

## Tests

`npm test` runs four suites:

- **`test/qloo.test.mjs`** starts a fake Qloo instance that enforces the request shape — `X-Api-Key` and no `Authorization`, seeds joined by commas, explainability on, `results.entities` parsing, 401 surfaced as an error, network failure surfaced as status 0, no invented rows for an unknown payload, and a cross-domain call where one media type fails while the others still return.
- **`test/plan.test.mjs`** covers the day planner: one stop per slot, ranking by affinity, reasons mapped to the seeds the user actually picked, empty reasons when Qloo gives none, and gaps named rather than filled.
- **`test/app.test.mjs`** covers the HTTP handler shared by Node and the Worker: cross-domain shaping with reasons, a refused empty seed list, a Qloo failure surfacing its real status, and the health badge telling the truth about the data source.
- **`test/mcp.test.mjs`** covers the agent interface: capability advertisement, tool discovery with schemas, a real `find_entities → plan_day` chain, a tool error the model can read, and JSON-RPC errors for unknown methods and tools.

29 tests, no network, no mocks of our own code — only of Qloo.

## Layout

```
src/qloo.mjs      Qloo client (no dependencies)
src/plan.mjs      seeds + places → a five-stop day with reasons
src/app.mjs       transport-agnostic handler (Node and Workers)
src/mcp.mjs       MCP server over JSON-RPC: find_entities, plan_day, cross_media
src/server.mjs    local dev server + static files
src/worker.mjs    Cloudflare Worker entry (API + MCP + static assets)
public/index.html the whole UI, one file, no build step
fixtures/         deterministic stand-in for the API
```

## Limits, stated plainly

- The fixture is Lisbon-shaped and fake. The badge says so, and the payload carries `source: "fixture"`.
- Slot detection reads place subtype and tags. If Qloo returns a subtype the planner does not recognise, that place is skipped rather than forced into the wrong hour.
- No accounts, no tracking, no storage. A day exists for as long as the page is open.

MIT licensed.
