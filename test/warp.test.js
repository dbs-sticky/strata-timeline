import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWarp } from '../src/core/warp.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('no zones is the identity', () => {
  const w = createWarp([]);
  assert.equal(w.isIdentity, true);
  assert.equal(w.W(5), 5);
  assert.equal(w.inv(5), 5);
  assert.deepEqual(w.segments(0, 10), [{ from: 0, to: 10, slope: 1 }]);
});

test('magnify stretches and the map stays continuous', () => {
  const w = createWarp([{ start: 100, end: 110, magnify: 10 }]);
  assert.equal(w.W(50), 50);
  assert.equal(w.W(100), 100);
  assert.equal(w.W(105), 150);
  assert.equal(w.W(110), 200);
  assert.equal(w.W(120), 210);
  assert.equal(w.slopeAt(105), 10);
  assert.equal(w.slopeAt(120), 1);
});

test('compress squashes time', () => {
  const w = createWarp([{ start: 0, end: 1000, magnify: 0.1 }]);
  assert.equal(w.W(1000), 100);
  assert.equal(w.W(1500), 600);
});

test('round trip and monotonicity with nested zones', () => {
  const w = createWarp([
    { start: 100, end: 200, magnify: 4 },
    { start: 140, end: 160, magnify: 5 },
    { start: 400, end: 500, magnify: 0.25 },
  ]);
  assert.equal(w.slopeAt(150), 20);
  assert.equal(w.slopeAt(120), 4);
  let prev = -Infinity;
  for (let t = 0; t <= 700; t += 0.37) {
    const v = w.W(t);
    assert.ok(v > prev);
    prev = v;
    close(w.inv(v), t, 1e-7);
  }
});

test('segments split at breakpoints with the right slopes', () => {
  const w = createWarp([{ start: 100, end: 200, magnify: 4 }, { start: 140, end: 160, magnify: 5 }]);
  const segs = w.segments(50, 300);
  assert.deepEqual(segs.map((s) => [s.from, s.to, s.slope]), [
    [50, 100, 1], [100, 140, 4], [140, 160, 20], [160, 200, 4], [200, 300, 1],
  ]);
  assert.deepEqual(w.segments(120, 130).map((s) => s.slope), [4]);
});

test('invalid zones are ignored', () => {
  const w = createWarp([{ start: 5, end: 5, magnify: 3 }, { start: 1, end: 2, magnify: 0 }, { start: 1, end: 2, magnify: 1 }]);
  assert.equal(w.isIdentity, true);
});
