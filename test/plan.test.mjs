import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, explain } from '../src/plan.mjs';

const e = (id, name, subtype, affinity, inputs) => ({
  id, name, subtype, affinity,
  tags: [], explainability: inputs ? { inputs } : null,
});

test('assigns one stop per slot in day order', () => {
  const plan = buildPlan({
    city: 'Lisbon',
    entities: [
      e('a', 'Cafe A', 'cafe', 0.9),
      e('b', 'Bistro B', 'restaurant', 0.8),
      e('c', 'Gallery C', 'gallery', 0.7),
      e('d', 'Bar D', 'cocktail bar', 0.6),
      e('f', 'Jazz F', 'jazz club', 0.5),
    ],
  });
  assert.deepEqual(plan.stops.map((s) => s.slot), ['morning', 'lunch', 'afternoon', 'evening', 'late']);
  assert.deepEqual(plan.gaps, []);
  assert.equal(plan.considered, 5);
});

test('names the slots it could not fill instead of padding the day', () => {
  const plan = buildPlan({ city: 'X', entities: [e('a', 'Cafe A', 'cafe', 0.9)] });
  assert.deepEqual(plan.stops.map((s) => s.slot), ['morning']);
  assert.deepEqual(plan.gaps, ['Lunch', 'Afternoon', 'Evening', 'Late']);
});

test('never uses the same slot twice, and ranks by affinity', () => {
  const plan = buildPlan({ city: 'X', entities: [e('a', 'Bar A', 'bar', 0.4), e('b', 'Jazz B', 'jazz club', 0.9)] });
  assert.deepEqual(plan.stops.map((s) => s.slot), ['evening', 'late']);
  assert.equal(plan.stops[0].entity.id, 'b');
  assert.equal(new Set(plan.stops.map((s) => s.slot)).size, plan.stops.length);
});

test('explain maps seed ids to the labels the user picked, strongest first', () => {
  const why = explain(e('p', 'P', 'place', 1, [
    { id: 's1', score: 0.2 },
    { id: 's2', score: 0.9 },
    { id: 's3', score: 0.5 },
    { id: 's4', score: 0.4 },
  ]), { s1: 'Burial', s2: 'Wong Kar-wai', s3: 'Ichiran', s4: 'Bolaño' });
  assert.deepEqual(why.map((w) => w.label), ['Wong Kar-wai', 'Ichiran', 'Bolaño']);
});

test('no explainability means an empty why, not a fabricated one', () => {
  assert.deepEqual(explain(e('p', 'P', 'place', 1, null), {}), []);
});

test('empty entity list yields an empty plan with every gap named', () => {
  const plan = buildPlan({ city: 'Nowhere', entities: [] });
  assert.equal(plan.stops.length, 0);
  assert.equal(plan.gaps.length, 5);
});
