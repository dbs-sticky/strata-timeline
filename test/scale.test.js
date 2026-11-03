import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysFromCivil } from '../src/core/dates.js';
import { createWarp } from '../src/core/warp.js';
import { LADDER, buildAxis, pickTick } from '../src/core/scale.js';

test('ladder is strictly ascending', () => {
  for (let i = 1; i < LADDER.length; i++) assert.ok(LADDER[i].days > LADDER[i - 1].days, `${i}`);
});

test('pickTick chooses coarser units as the scale shrinks', () => {
  assert.equal(pickTick(200).unit, 'hour');
  assert.equal(pickTick(70).unit, 'day');
  assert.equal(pickTick(10).unit, 'week');
  assert.equal(pickTick(3).unit, 'month');
  assert.equal(pickTick(0.8).unit, 'month');
  assert.equal(pickTick(0.8).step, 3);
  assert.equal(pickTick(0.5).unit, 'year');
  assert.equal(pickTick(0.2).unit, 'year');
  assert.equal(pickTick(0.002).unit, 'year');
  assert.ok(pickTick(0.002).step >= 100);
});

test('monthly axis over a year', () => {
  const a = daysFromCivil(2019, 1, 1);
  const b = daysFromCivil(2020, 1, 1);
  const { minor, major } = buildAxis(createWarp([]), a, b, 3);
  assert.equal(minor.length, 12);
  assert.deepEqual(minor.slice(0, 3).map((m) => m.label), ['Jan', 'Feb', 'Mar']);
  assert.equal(major.length, 1);
  assert.equal(major[0].label, '2019');
  assert.equal(major[0].t0, a);
  assert.equal(major[0].t1, b);
});

test('daily axis labels and month cells', () => {
  const a = daysFromCivil(2024, 2, 20);
  const b = daysFromCivil(2024, 3, 5);
  const { minor, major } = buildAxis(createWarp([]), a, b, 80);
  assert.equal(minor.length, 14);
  assert.deepEqual(major.map((m) => m.label), ['Feb 2024', 'Mar 2024']);
  assert.equal(major[0].t1, daysFromCivil(2024, 3, 1));
});

test('hot zones get finer ticks and clipped cells', () => {
  const zone = { start: daysFromCivil(2024, 2, 5), end: daysFromCivil(2024, 2, 26), magnify: 60 };
  const warp = createWarp([zone]);
  const a = daysFromCivil(2023, 1, 1);
  const b = daysFromCivil(2025, 1, 1);
  const { minor, major } = buildAxis(warp, a, b, 1.2);
  const inside = minor.filter((m) => m.seg === 1);
  assert.ok(inside.length >= 20, 'one tick per day inside the zone');
  assert.ok(minor.filter((m) => m.seg !== 1).every((m) => /^[A-Z][a-z]{2}$|^\d{4}$/.test(m.label)));
  const cell = major.find((m) => m.t0 === zone.start);
  assert.ok(cell, 'a major cell starts exactly at the zone boundary');
  assert.ok(cell.t1 <= zone.end);
});

test('BCE years label correctly', () => {
  const { minor } = buildAxis(createWarp([]), daysFromCivil(-500, 1, 1), daysFromCivil(-300, 1, 1), 0.5);
  assert.ok(minor.some((m) => m.label.endsWith('BCE')));
});
