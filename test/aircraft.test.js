import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromAircraft } from '../src/adapters/aircraft.js';
import { normalize } from '../src/core/model.js';

const now = Date.UTC(2026, 10, 3);
const api = {
  aircraft: { registration: 'N0001X', type: 'A320-232' },
  history: [
    { type: 'order', date: '2010-03', customer: 'Example Air' },
    { type: 'delivery', date: '2012-05-04', to_operator: 'Example Air' },
    { type: 'lease', from: '2012-05-04', to: '2020-05', lessor: 'Lessor Co', lessee: 'Example Air' },
    { type: 'operator', from: '2012-05-04', to: null, operator: 'Example Air' },
    { type: 'storage', from: '2020-04-01', to: '2021-06-01', location: 'Teruel' },
    { type: 'maintenance', from: '2024-02-05', to: '2024-02-26', check: 'C-check', location: 'CWL' },
    { type: 'maintenance', from: '2024-02-10', to: '2024-02-12', check: 'Overlap' },
    { type: 'maintenance', from: '2016-01-01', to: '2017-06-01', check: 'Long' },
    { type: 'occurrence', date: '2019-08-09', summary: 'Diversion', source: 'https://example.com/x' },
  ],
};

test('aircraft adapter maps history to lanes and spans', () => {
  const native = fromAircraft(api, { now });
  assert.equal(native.title, 'N0001X · A320-232');
  assert.equal(native.events.length, 9);
  const op = native.events.find((e) => e.category === 'operator');
  assert.equal(op.ongoing, true);
  assert.equal(op.end, undefined);
  const order = native.events.find((e) => e.category === 'order');
  assert.equal(order.title, 'Ordered by Example Air');
  assert.equal(order.end, undefined);
  assert.equal(order.ongoing, undefined);
  assert.equal(native.hotZones.length, 1, 'only the short, non-overlapping check is magnified');
  assert.equal(native.hotZones[0].label, 'C-check');
  assert.ok(native.decorators.some((d) => d.type === 'span' && d.label === 'Stored'));
  assert.deepEqual(native.events.at(-1).links, [{ href: 'https://example.com/x', label: 'Source' }]);
});

test('adapter output normalises without warnings', () => {
  const model = normalize(fromAircraft(api, { now }), { now });
  assert.deepEqual(model.warnings, []);
  assert.equal(model.lanes.length, 5);
  assert.equal(model.zones.length, 1);
  assert.equal(model.byId.get('h0').kind, 'instant');
});

test('magnifyChecks false disables zones', () => {
  assert.equal(fromAircraft(api, { magnifyChecks: false }).hotZones.length, 0);
});
