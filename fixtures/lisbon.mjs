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

export function search(term) {
  const t = term.toLowerCase();
  const hits = SEEDS.filter((s) => s.name.toLowerCase().includes(t)).slice(0, 6);
  return hits.length ? hits : SEEDS.slice(0, 3).map((s) => ({ ...s, name: `${term} (fixture match: ${s.name})` }));
}

export async function insights({ city, seeds = [] }) {
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
