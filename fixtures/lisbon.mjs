// fixtures/lisbon.mjs — deterministic stand-in for the Qloo API so the UI can be
// built and demoed before the hackathon key arrives. Every id here is fake and
// the payload says source:"fixture" so a demo can never be mistaken for live data.
const SEEDS = [
  { id: 'seed-burial', name: 'Burial', type: 'urn:entity:artist' },
  { id: 'seed-wkw', name: 'Wong Kar-wai', type: 'urn:entity:person' },
  { id: 'seed-ichiran', name: 'Ichiran', type: 'urn:entity:place' },
  { id: 'seed-bolano', name: 'Roberto Bolaño', type: 'urn:entity:person' },
  { id: 'seed-mfdoom', name: 'MF DOOM', type: 'urn:entity:artist' },
];

const PLACES = [
  ['p1', 'Café da Esquina', 'cafe', 0.91, ['seed-burial', 0.52], ['seed-wkw', 0.31]],
  ['p2', 'Taberna do Mar', 'restaurant', 0.88, ['seed-ichiran', 0.61], ['seed-bolano', 0.22]],
  ['p3', 'Galeria Zé dos Bois', 'gallery', 0.86, ['seed-wkw', 0.58], ['seed-burial', 0.27]],
  ['p4', 'Livraria Simão', 'bookstore', 0.81, ['seed-bolano', 0.66]],
  ['p5', 'Bar A Cerca', 'cocktail bar', 0.79, ['seed-burial', 0.44], ['seed-mfdoom', 0.38]],
  ['p6', 'Hot Clube de Portugal', 'jazz club', 0.77, ['seed-burial', 0.71], ['seed-mfdoom', 0.29]],
  ['p7', 'Padaria do Bairro', 'bakery', 0.74, ['seed-ichiran', 0.33]],
  ['p8', 'Cinemateca Portuguesa', 'cinema', 0.72, ['seed-wkw', 0.69]],
];

const img = (n) => `https://picsum.photos/seed/adjacent${n}/640/420`;

// The bundled sample is Lisbon and nothing else. Serving these places for
// "Tokyo" would be a lie the UI could not detect, so any other city returns an
// empty result and the page says the sample is limited.
export const SAMPLE_CITY = 'Lisbon';

export function search(term) {
  const t = term.toLowerCase();
  const hits = SEEDS.filter((s) => s.name.toLowerCase().includes(t)).slice(0, 6);
  return hits.length ? hits : SEEDS.slice(0, 3).map((s) => ({ ...s, name: `${term} (fixture match: ${s.name})` }));
}

// Tags per seed, so the shared-taste strip matches the seeds that were actually
// sent. A fixed list would tell a Wong Kar-wai fan they listen to dub techno.
const TAGS_BY_SEED = {
  'seed-burial': [['dub techno', 0.71], ['bristol sound', 0.58], ['ambient', 0.49]],
  'seed-mfdoom': [['abstract hip hop', 0.69], ['sampledelia', 0.52], ['nocturnal', 0.44]],
  'seed-wkw': [['slow cinema', 0.66], ['hong kong new wave', 0.57], ['nocturnal', 0.41]],
  'seed-ichiran': [['tonkotsu ramen', 0.63], ['late-night dining', 0.5], ['solo counter', 0.38]],
  'seed-bolano': [['latin american fiction', 0.61], ['slow cinema', 0.4], ['nocturnal', 0.33]],
};

export async function tasteTags({ seeds = [] } = {}) {
  const chosen = seeds.length ? seeds : Object.keys(TAGS_BY_SEED);
  const merged = new Map();
  for (const id of chosen) {
    for (const [name, affinity] of TAGS_BY_SEED[id] || []) {
      merged.set(name, Math.max(merged.get(name) || 0, affinity));
    }
  }
  return [...merged.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, affinity]) => ({ id: 'tag-' + name.replace(/\s+/g, '-'), name, type: 'urn:tag:keyword:media', affinity }));
}

const CROSS = {
  'urn:entity:artist': [
    ['a1', 'Demdike Stare', 0.82, 'seed-burial', 0.61],
    ['a2', 'Andy Stott', 0.79, 'seed-burial', 0.57],
    ['a3', 'KTL', 0.71, 'seed-wkw', 0.34],
  ],
  'urn:entity:movie': [
    ["m1", "Long Day's Journey into Night", 0.77, 'seed-wkw', 0.63],
    ['m2', 'The Turin Horse', 0.74, 'seed-bolano', 0.41],
    ['m3', 'Sonatine', 0.70, 'seed-wkw', 0.38],
  ],
  'urn:entity:book': [
    ['b1', '2666', 0.81, 'seed-bolano', 0.72],
    ['b2', 'The Emigrants', 0.69, 'seed-wkw', 0.29],
  ],
};

export async function crossDomain({ seeds = [] }) {
  const chosen = new Set(seeds);
  const out = {};
  for (const [type, rows] of Object.entries(CROSS)) {
    out[type] = rows.map(([id, name, affinity, sid, score], i) => ({
      id, name, type, affinity, image: img(30 + i),
      explainability: { inputs: chosen.size === 0 || chosen.has(sid) ? [{ id: sid, score }] : [] },
    }));
  }
  return out;
}

export async function insights({ city, seeds = [] }) {
  const c = String(city || '').trim().toLowerCase();
  if (c !== 'lisbon' && c !== 'lisboa') return [];
  const chosen = new Set(seeds);
  return PLACES.map(([id, name, subtype, affinity, ...inputs], i) => ({
    id,
    name,
    type: 'urn:entity:place',
    subtype,
    affinity,
    tags: [subtype],
    image: img(i + 1),
    description: null,
    city,
    lat: 38.71 + i * 0.002,
    lon: -9.14 + i * 0.002,
    // Only explain with seeds the caller actually sent, like the real API does.
    explainability: {
      inputs: inputs.filter(([sid]) => chosen.size === 0 || chosen.has(sid)).map(([sid, score]) => ({ id: sid, score })),
    },
  }));
}
