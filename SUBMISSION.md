# Submission — Adjacent (Qloo Agentic Hackathon)

Live demo: **https://adjacent.ojikaminari.workers.dev**
Repo: this repository (MIT). The header badge always states whether the data is `live Qloo` or `fixture data`.

## 1. Problem statement

Travel recommendations ask what you want to *do*. They answer with the same ten places for everyone, because a language model has no taste graph and no evidence. A traveller with specific taste — a Burial listener, a Wong Kar-wai fan, an Ichiran regular — wants the record shop, gallery, or lunch that people *like them* end up in, in a city they have never visited. Today that answer comes from a friend with the same taste, or from an hour of forum scrolling.

Adjacent asks what you already love, in any domain, and moves that taste sideways into another domain and another city. Every stop carries the evidence: which seed contributed, and with what normalised weight.

## 2. Workflow and tools

The product is a three-step agent workflow, exposed both as a web UI and as an MCP server (`POST /mcp`, JSON-RPC 2.0):

| Tool | Input | Output | Why it exists |
|---|---|---|---|
| `find_entities` | free-text name | Qloo entity ids | The model must not guess ids; names are ambiguous. |
| `plan_day` | seed entity ids + city | 5 stops, each with reasons and named gaps | The core product: a day built from cross-domain affinity. |
| `cross_media` | seed entity ids | artists, films, books | Proves the graph moves across media, not just venues. |

The tools are meant to be chained: `find_entities` → `plan_day` / `cross_media`. `initialize`, `tools/list`, `tools/call`, and `ping` are implemented; notifications return `202` with no body; tool failures return `isError: true` with the real message.

A recorded session with real request/response pairs is in [`demo/agent-session.md`](demo/agent-session.md).

## 3. How Qloo is used (request → result)

Base URL: `https://hackathon.api.qloo.com`. Auth: `X-Api-Key` (never a query parameter, never `Authorization`).

```
GET /search?query=Burial
  → entity ids for the seed

GET /v2/insights
  ?filter.type=urn:entity:place
  &signal.interests.entities=<seed ids, comma separated>
  &filter.geocode.city=Lisbon
  &take=40
  &feature.explainability=true
  → places that share audience with the seeds, with per-seed weights
```

`/v2/tags` is used to validate tag ids. `/recommendations` and `/recs` are never called — they are legacy and unsupported by hackathon keys.

**Why these choices.**
- `signal.interests.entities` (not a text query) is what makes the result taste-driven rather than popularity-driven.
- `feature.explainability=true` is what lets the UI print `because you love Burial · 0.52` from Qloo's own payload instead of generated prose.
- `filter.geocode.city` keeps the answer in the city the user asked for; without it the graph returns globally popular places.

**Redaction.** The demo screenshots and the recorded session contain no API key, no personal data, and no private identifiers. Seed labels are public artist/film names.

## 4. Demo and screenshots

- Live app: https://adjacent.ojikaminari.workers.dev
- Screenshots: `demo/` (day view, cross-media panel, MCP session).
- Live since 2026-10-20: the deployed Worker holds the hackathon key as a secret (`wrangler secret put QLOO_API_KEY`) and the badge reads `live Qloo`. Every stop carries the affinity score Qloo returned and the tags Qloo attached to the place. The fixture path still exists (`QLOO_MOCK=1`) and the badge never hides which one is running.

## 5. Setup from a clean environment

```bash
git clone <repo> && cd adjacent
npm test                 # 31 tests, no network
npm run start:mock       # http://127.0.0.1:8123, fixture data
QLOO_API_KEY=... npm start   # live Qloo
```

Deploy: `npx wrangler deploy` (Cloudflare Worker + static assets). No database, no build step, no runtime dependencies.

## 6. Known limitations (what this does NOT prove)

- **Explainability is thinner than the UI implies.** `/v2/insights` on a hackathon key returns `query.affinity`, `tags` and `query.measurements`, but not a per-seed explanation payload. The `why` row is therefore usually empty; the card falls back to affinity and tags, which is the evidence Qloo actually gave. No reason is ever synthesised.
- **Coverage is Qloo's coverage.** A domain or city the graph does not cover produces a shorter plan with named gaps, not a padded one.
- **No persistence or accounts.** The app is stateless; a saved day is a URL, not a user profile.
- **Affinity is not causality.** A high weight means shared audience, not "you will like this". The UI presents it as evidence, not a promise.
