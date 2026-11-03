import { addUnit, civilFromDays, floorUnit, monthName, weekdayName, yearLabel } from './dates.js';

// Tick ladder, ordered by nominal length in days. `major` is the coarser unit drawn in the top axis row.
const HOUR = { unit: 'hour', step: 1 };
const DAY = { unit: 'day', step: 1 };
const MONTH = { unit: 'month', step: 1 };
const YEAR = { unit: 'year', step: 1 };

export const LADDER = (() => {
  const rungs = [];
  const add = (unit, step, days, major) => rungs.push({ unit, step, days, major });
  for (const s of [1, 5, 15]) add('minute', s, s / 1440, HOUR);
  for (const s of [1, 3, 6, 12]) add('hour', s, s / 24, DAY);
  add('day', 1, 1, MONTH);
  add('week', 1, 7, MONTH);
  add('month', 1, 30.4375, YEAR);
  add('month', 3, 91.3125, YEAR);
  for (let p = 0; p <= 7; p++) {
    for (const k of [1, 2, 5]) {
      const step = k * 10 ** p;
      add('year', step, step * 365.2425, { unit: 'year', step: 10 ** (p + 1) });
    }
  }
  return rungs;
})();

/** Smallest rung whose spacing is at least `minPx` at the given scale (px per band day). */
export function pickTick(pxPerDay, minPx = 64) {
  return LADDER.find((r) => r.days * pxPerDay >= minPx) ?? LADDER[LADDER.length - 1];
}

const pad2 = (n) => String(n).padStart(2, '0');

function clock(t) {
  const mins = Math.round((t - Math.floor(t)) * 1440);
  return `${pad2(Math.floor(mins / 60) % 24)}:${pad2(mins % 60)}`;
}

export function minorLabel(t, rung, pxPerDay, locale) {
  switch (rung.unit) {
    case 'minute':
    case 'hour':
      return clock(t);
    case 'day': {
      const { d } = civilFromDays(t);
      return pxPerDay >= 96 ? `${weekdayName(t, locale)} ${d}` : String(d);
    }
    case 'week':
      return String(civilFromDays(t).d);
    case 'month':
      return monthName(civilFromDays(t).m, locale);
    default:
      return yearLabel(civilFromDays(t).y);
  }
}

export function majorLabel(t, rung, locale) {
  const { y, m, d } = civilFromDays(t);
  switch (rung.unit) {
    case 'hour':
      return clock(t);
    case 'day':
      return `${weekdayName(t, locale)} ${d} ${monthName(m, locale)} ${yearLabel(y)}`;
    case 'month':
      return `${monthName(m, locale)} ${yearLabel(y)}`;
    default:
      return rung.step === 10 || rung.step === 100 ? (y > 0 ? `${y}s` : yearLabel(y)) : yearLabel(y);
  }
}

const MAX_TICKS = 800;

/**
 * Build axis ticks for real-time range [a, b]. The warp is walked segment by segment so magnified zones get
 * finer ticks and compressed ones coarser. Major cells are clipped at segment boundaries.
 * @returns {{minor: {t:number,label:string,seg:number}[], major: {t0:number,t1:number,label:string}[]}}
 */
export function buildAxis(warp, a, b, ppd, { locale = 'en-GB', minPx = 64 } = {}) {
  const minor = [];
  const major = [];
  warp.segments(a, b).forEach((seg, index) => {
    const eff = ppd * seg.slope;
    const rung = pickTick(eff, minPx);

    let count = 0;
    for (let t = floorUnit(seg.from, rung.unit, rung.step); t < seg.to && count < MAX_TICKS; t = addUnit(t, rung.unit, rung.step), count++) {
      if (t >= seg.from - 1e-9) minor.push({ t, label: minorLabel(t, rung, eff, locale), seg: index });
    }

    const mj = rung.major;
    count = 0;
    for (let t = floorUnit(seg.from, mj.unit, mj.step); t < seg.to && count < MAX_TICKS; count++) {
      const next = addUnit(t, mj.unit, mj.step);
      major.push({ t0: Math.max(t, seg.from), t1: Math.min(next, seg.to), label: majorLabel(t, mj, locale) });
      t = next;
    }
  });
  return { minor, major };
}
