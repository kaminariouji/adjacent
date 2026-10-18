# Adjacent

**A city that fits you.** Pick a few things you love — a musician, a film, a restaurant — and Adjacent builds a day in a city you have not visited, with the taste evidence behind every stop.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

## The idea

Travel recommendations usually ask what you want to *do*. Adjacent asks what you already *love*, in any domain, and then moves that taste sideways: a Burial listener's next cocktail bar, a Wong Kar-wai fan's next gallery, an Ichiran regular's next lunch. The interesting question is not "what is popular in Lisbon" but "what in Lisbon is popular with people like you".

Qloo's taste graph is the only reason this works. A generic LLM would answer with the same ten tourist places for everyone.

## What makes the reasons real

Every card shows chips like `because you love Burial · 0.52`. Those numbers are not generated text — they come from Qloo's own explainability payload (`feature.explainability=true`), which reports which input entities contributed to a recommendation and with what normalised weight.

Two rules follow from that, and both are enforced in code:

- If Qloo returns no explanation for a place, the card shows **no reason**. It never writes a plausible-sounding one.
- If Qloo returns fewer places than the day has slots, the plan is **shorter and names the gaps**. It never pads the day with filler.

A tool that explains itself has to be honest about the parts it cannot explain.

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

`npm test` runs two suites:

- **`test/qloo.test.mjs`** starts a fake Qloo instance that enforces the request shape — `X-Api-Key` and no `Authorization`, seeds joined by commas, explainability on, `results.entities` parsing, 401 surfaced as an error, network failure surfaced as status 0, and no invented rows for an unknown payload.
- **`test/plan.test.mjs`** covers the day planner: one stop per slot, ranking by affinity, reasons mapped to the seeds the user actually picked, empty reasons when Qloo gives none, and gaps named rather than filled.

## Layout

```
src/qloo.mjs      Qloo client (no dependencies)
src/plan.mjs      seeds + places → a five-stop day with reasons
src/app.mjs       transport-agnostic handler (Node and Workers)
src/server.mjs    local dev server + static files
public/index.html the whole UI, one file, no build step
fixtures/         deterministic stand-in for the API
```

## Limits, stated plainly

- The fixture is Lisbon-shaped and fake. The badge says so, and the payload carries `source: "fixture"`.
- Slot detection reads place subtype and tags. If Qloo returns a subtype the planner does not recognise, that place is skipped rather than forced into the wrong hour.
- No accounts, no tracking, no storage. A day exists for as long as the page is open.

MIT licensed.
