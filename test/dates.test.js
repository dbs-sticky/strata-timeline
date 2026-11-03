import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MS_DAY, addUnit, civilFromDays, daysFromCivil, floorUnit, formatDate, formatDuration, parseDate, yearLabel,
} from '../src/core/dates.js';

test('civil conversions agree with Date.UTC', () => {
  for (const [y, m, d] of [[1970, 1, 1], [2000, 2, 29], [2019, 7, 27], [1900, 3, 1], [2100, 12, 31], [1600, 2, 29]]) {
    assert.equal(daysFromCivil(y, m, d), Date.UTC(y, m - 1, d) / MS_DAY);
    assert.deepEqual(civilFromDays(daysFromCivil(y, m, d)), { y, m, d });
  }
});

test('civil conversions round trip across BCE and far future', () => {
  for (let z = -800000; z < 800000; z += 997) {
    const { y, m, d } = civilFromDays(z);
    assert.equal(daysFromCivil(y, m, d), z);
  }
  assert.deepEqual(civilFromDays(daysFromCivil(-490, 3, 1)), { y: -490, m: 3, d: 1 });
});

test('parseDate handles precision', () => {
  const day = parseDate('2019-07-27');
  assert.equal(day.precision, 'day');
  assert.equal(day.lo, day.hi);
  const month = parseDate('2014-03');
  assert.equal(month.precision, 'month');
  assert.equal(month.hi - month.lo, 31);
  assert.equal(month.at, (month.lo + month.hi) / 2);
  const year = parseDate('2016');
  assert.equal(year.hi - year.lo, 366);
  const dec = parseDate('2019-12');
  assert.equal(dec.hi, daysFromCivil(2020, 1, 1));
});

test('parseDate handles times, offsets and special words', () => {
  const t = parseDate('2019-07-27T12:00:00Z');
  assert.equal(t.at, parseDate('2019-07-27').at + 0.5);
  assert.equal(parseDate('2019-07-27T12:00:00+02:00').at, parseDate('2019-07-27T10:00Z').at);
  const now = Date.UTC(2026, 10, 3, 15, 30);
  assert.equal(parseDate('today', { now }).at, daysFromCivil(2026, 11, 3));
  assert.equal(parseDate('now', { now }).at, now / MS_DAY);
  assert.equal(parseDate(new Date(Date.UTC(2020, 0, 1))).at, daysFromCivil(2020, 1, 1));
});

test('parseDate rejects invalid input', () => {
  for (const bad of ['', 'banana', '2019-13', '2019-02-30', '2019-07-27T25:00', null, undefined, '19-07-27']) {
    assert.equal(parseDate(bad), null, String(bad));
  }
  assert.equal(parseDate('2020-02-29').precision, 'day');
  assert.equal(parseDate('2019-02-29'), null);
});

test('BCE and explicit ranges', () => {
  const p = parseDate('-0490');
  assert.equal(civilFromDays(p.lo).y, -490);
  assert.equal(yearLabel(-489), '490 BCE');
  assert.equal(formatDate(parseDate('-0490')), '491 BCE');
  const r = parseDate({ earliest: '2031-01', latest: '2031-12' });
  assert.equal(r.precision, 'range');
  assert.equal(r.lo, daysFromCivil(2031, 1, 1));
  assert.equal(r.hi, daysFromCivil(2032, 1, 1));
  assert.equal(formatDate(r), 'Jan 2031 – Dec 2031');
});

test('floorUnit and addUnit', () => {
  const t = daysFromCivil(2019, 7, 27) + 0.6;
  assert.equal(floorUnit(t, 'day'), daysFromCivil(2019, 7, 27));
  assert.equal(floorUnit(t, 'month'), daysFromCivil(2019, 7, 1));
  assert.equal(floorUnit(t, 'year'), daysFromCivil(2019, 1, 1));
  assert.equal(floorUnit(t, 'year', 10), daysFromCivil(2010, 1, 1));
  assert.equal(floorUnit(daysFromCivil(-490, 5, 5), 'year', 100), daysFromCivil(-500, 1, 1));
  assert.equal(floorUnit(t, 'month', 3), daysFromCivil(2019, 7, 1));
  // 2019-07-27 is a Saturday, so its week starts Monday 22 July.
  assert.equal(floorUnit(t, 'week'), daysFromCivil(2019, 7, 22));
  assert.equal(addUnit(daysFromCivil(2019, 1, 31), 'month'), daysFromCivil(2019, 2, 1));
  assert.equal(addUnit(daysFromCivil(2019, 12, 1), 'month', 2), daysFromCivil(2020, 2, 1));
  assert.equal(addUnit(daysFromCivil(2019, 1, 1), 'year', 10), daysFromCivil(2029, 1, 1));
  assert.ok(Math.abs(floorUnit(daysFromCivil(2020, 1, 1) + 0.4, 'hour', 6) - (daysFromCivil(2020, 1, 1) + 0.25)) < 1e-9);
});

test('formatting', () => {
  assert.equal(formatDate(parseDate('2019-07-27')), '27 Jul 2019');
  assert.equal(formatDate(parseDate('2019-07')), 'Jul 2019');
  assert.equal(formatDate(parseDate('2019')), '2019');
  assert.equal(formatDate(parseDate('2019-07-27T09:05Z')), '27 Jul 2019, 09:05 UTC');
  assert.equal(formatDuration(0.5), '12 h');
  assert.equal(formatDuration(21), '21 d');
  assert.equal(formatDuration(400), '13 mo');
  assert.equal(formatDuration(365.2425 * 12), '12 y');
});
