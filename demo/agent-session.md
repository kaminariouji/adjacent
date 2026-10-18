# One agent session, end to end

This is a real transcript: the requests below were sent to `POST /mcp` on the hosted demo,
and the responses are what came back, trimmed only where marked. Nothing is hand-written.

Endpoint: `https://adjacent.ojikaminari.workers.dev/mcp`
Run at: 2026-10-18T06:42:46.220Z

The chain an agent follows is `find_entities → plan_day → cross_media`: names become ids,
ids become a day, and the same ids become other media. A failure at any step comes back as
`isError: true` with the real message, so the model can read it instead of guessing.

## 1. initialize

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {
      "name": "session-demo",
      "version": "1.0.0"
    }
  }
}
```

Server answers:

```json
{
  "protocolVersion": "2025-06-18",
  "capabilities": {
    "tools": {}
  },
  "serverInfo": {
    "name": "adjacent",
    "version": "0.2.0"
  },
  "instructions": "Adjacent turns things a person already loves into a day in a city, plus the same taste in other media. Call find_entities first, then plan_day or cross_media with the ids."
}
```

## 2. tools/list

```
find_entities    Resolve a free-text name ("Burial", "Wong Kar-wai", "Ichiran") to Qloo entity ids.
plan_day         Build a five-stop day (morning, lunch, afternoon, evening, late) in a city from things the user loves.
cross_media      Ask the same taste for artists, films and books.
```

## 3. find_entities

Request:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "find_entities",
    "arguments": {
      "query": "Wong Kar-wai"
    }
  }
}
```

Result:

```json
[
  {
    "id": "seed-wkw",
    "name": "Wong Kar-wai",
    "type": "urn:entity:person"
  }
]
```

## 4. plan_day

Request:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "plan_day",
    "arguments": {
      "seeds": [
        {
          "id": "seed-wkw",
          "label": "Wong Kar-wai"
        }
      ],
      "city": "Lisbon"
    }
  }
}
```

Result: 5 stops, 0 gaps, source `fixture`.

```json
{
  "city": "Lisbon",
  "stops": [
    {
      "slot": "morning",
      "name": "Café da Esquina",
      "affinity": 0.91,
      "why": [
        {
          "id": "seed-wkw",
          "label": "Wong Kar-wai",
          "score": 0.31
        }
      ]
    },
    {
      "slot": "lunch",
      "name": "Taberna do Mar",
      "affinity": 0.88,
      "why": []
    }
  ],
  "gaps": [],
  "taste": [
    "slow cinema 0.66",
    "hong kong new wave 0.57",
    "nocturnal 0.41"
  ]
}
```

…and 3 more stops in the full response.

## 5. cross_media

Same seeds, asked for in other media:

```json
{
  "urn:entity:artist": [
    "Demdike Stare",
    "Andy Stott"
  ],
  "urn:entity:movie": [
    "Long Day's Journey into Night",
    "The Turin Horse"
  ],
  "urn:entity:book": [
    "2666",
    "The Emigrants"
  ]
}
```

## 6. What a failure looks like

Deliberately omitting `city` — the tool reports it instead of inventing a day:

```json
{
  "content": [
    {
      "type": "text",
      "text": "city is required"
    }
  ],
  "isError": true
}
```
