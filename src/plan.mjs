// plan.mjs — turn a handful of loved things into a day in a city you have not
// visited. Every stop carries the reason Qloo gave for it; when Qloo does not
// give one, the stop says so instead of inventing a story.

const SLOTS = [
  { key: 'morning', label: 'Morning', want: /cafe|coffee|bakery|breakfast|patisserie/i },
  { key: 'lunch', label: 'Lunch', want: /restaurant|bistro|deli|taqueria|trattoria|izakaya|eatery/i },
  { key: 'afternoon', label: 'Afternoon', want: /gallery|museum|bookstore|bookshop|library|record|cinema|theatre|theater/i },
  { key: 'evening', label: 'Evening', want: /bar|cocktail|wine|pub|music|club|jazz|brewery/i },
  { key: 'late', label: 'Late', want: /bar|cocktail|wine|pub|music|club|jazz|brewery|late/i },
];

function slotFor(entity, used) {
  const hay = `${entity.subtype || ''} ${entity.type || ''} ${(entity.tags || []).join(' ')} ${entity.name || ''}`;
  for (const s of SLOTS) {
    if (!used.has(s.key) && s.want.test(hay)) return s;
  }
  return null;
}

/** Map Qloo's explainability payload onto the seed labels the user picked. */
export function explain(entity, seedLabels) {
  const ex = entity.explainability;
  const rows = ex?.inputs || ex?.entities || ex?.signals || [];
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows
    .map((r) => {
      const id = r.id || r.entity_id || r.entity?.id;
      const score = typeof r.score === 'number' ? r.score : typeof r.normalized_score === 'number' ? r.normalized_score : null;
      if (!id || score === null) return null;
      return { id, label: seedLabels[id] || id, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Build a five-stop day. Returns only what the API gave us: if fewer than five
 * places come back, the plan is shorter and `gaps` says which slots are empty.
 */
export function buildPlan({ entities, city, seedLabels = {} }) {
  const used = new Set();
  const stops = [];
  const pool = [...entities].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
  for (const e of pool) {
    const slot = slotFor(e, used);
    if (!slot) continue;
    used.add(slot.key);
    stops.push({
      slot: slot.key,
      slotLabel: slot.label,
      entity: e,
      why: explain(e, seedLabels),
      score: e.affinity,
    });
    if (stops.length === SLOTS.length) break;
  }
  const gaps = SLOTS.filter((s) => !used.has(s.key)).map((s) => s.label);
  const order = new Map(SLOTS.map((s, i) => [s.key, i]));
  stops.sort((a, b) => order.get(a.slot) - order.get(b.slot));
  return { city, stops, gaps, considered: entities.length };
}
