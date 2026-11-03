import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packTracks } from '../src/core/layout.js';
import { IntervalIndex } from '../src/core/interval-index.js';
import { normalize } from '../src/core/model.js';

test('packTracks reuses free tracks', () => {
  const r = packTracks([{ x0: 0, x1: 10 }, { x0: 5, x1: 12 }, { x0: 10, x1: 20 }, { x0: 12, x1: 14 }]);
  assert.deepEqual(r.track, [0, 1, 0, 1]);
  assert.equal(r.count, 2);
  assert.deepEqual(packTracks([]), { track: [], count: 0 });
});

test('IntervalIndex matches brute force', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const items = Array.from({ length: 400 }, () => {
    const lo = rnd() * 1000;
    return { lo, hi: lo + (rnd() < 0.05 ? rnd() * 600 : rnd() * 5) };
  });
  const index = new IntervalIndex(items);
  for (let q = 0; q < 200; q++) {
    const a = rnd() * 1000;
    const b = a + rnd() * 80;
    const expect = items.filter((i) => i.lo <= b && i.hi >= a).sort((x, y) => x.lo - y.lo || x.hi - y.hi);
    assert.deepEqual(index.query(a, b), expect);
  }
});

test('normalize builds lanes, categories and uncertainty', () => {
  const m = normalize(
    {
      lanes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      categories: { lease: { label: 'Lease', color: '#123456' } },
      events: [
        { id: 'x', title: 'Lease', start: '2019-07', end: { earliest: '2031-01', latest: '2031-12' }, lane: 'a', category: 'lease', link: 'javascript:alert(1)' },
        { title: 'Point', start: '2020-05-01', lane: 'b', category: 'other' },
        { title: 'Open', start: '2022-01-01', ongoing: true },
        { title: 'Bad', start: 'nope' },
        { title: 'Backwards', start: '2020-02-01', end: '2020-01-01' },
      ],
      decorators: [{ type: 'point', date: 'today', label: 'Now' }, { type: 'span', start: '2020', end: '2021' }],
      hotZones: [{ start: '2024-02-01', end: '2024-03-01', magnify: 12 }],
    },
    { now: Date.UTC(2026, 10, 3) },
  );
  assert.equal(m.events.length, 3);
  assert.equal(m.warnings.length, 2);
  const lease = m.byId.get('x');
  assert.equal(lease.kind, 'span');
  assert.ok(lease.b > lease.a, 'month precision start has a ramp');
  assert.ok(lease.d > lease.c, 'explicit range end has a ramp');
  assert.deepEqual(lease.links, []);
  assert.equal(lease.color, '#123456');
  assert.match(m.byId.get('e1').color, /^light-dark\(/);
  const open = m.events.find((e) => e.title === 'Open');
  assert.equal(open.ongoing, true);
  assert.equal(open.d, m.now);
  assert.equal(open.lane, 'a');
  assert.equal(m.decorators.length, 2);
  assert.equal(m.zones.length, 1);
  assert.ok(m.domain.t0 < lease.a && m.domain.t1 > m.now);
  assert.deepEqual(m.events.map((e) => e.index), [0, 1, 2]);
});
