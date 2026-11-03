// Dates are plain numbers: days since 1970-01-01T00:00Z (proleptic Gregorian, UTC), fractional for time of day.
// Years use astronomical numbering internally (0 = 1 BCE, -489 = 490 BCE).

export const MS_DAY = 86_400_000;

// Civil-date algorithms after Howard Hinnant (days_from_civil / civil_from_days).
export function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(z) {
  z = Math.floor(z) + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

const exact = (t, precision) => ({ lo: t, hi: t, at: t, precision });
const spanning = (lo, hi, precision) => ({ lo, hi, at: (lo + hi) / 2, precision });

const DATE_RE =
  /^([+-]?\d{4,6})(?:-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?)?)?$/i;

/**
 * Parse a date value into `{ lo, hi, at, precision }`.
 * Year and month precision cover their whole period (lo..hi); day precision and finer are exact instants.
 * Accepts ISO strings ("2019", "2019-07", "2019-07-27", "2019-07-27T10:30Z", "-0490"), "today", "now",
 * Date objects, epoch-ms numbers, and `{ earliest, latest }` ranges. Returns null when invalid.
 */
export function parseDate(input, { now = Date.now() } = {}) {
  if (input == null || input === '') return null;
  if (input instanceof Date) return Number.isNaN(+input) ? null : exact(+input / MS_DAY, 'second');
  if (typeof input === 'number') return Number.isFinite(input) ? exact(input / MS_DAY, 'second') : null;
  if (typeof input === 'object') return parseRange(input, { now });

  const s = String(input).trim();
  const word = s.toLowerCase();
  if (word === 'today') return exact(Math.floor(now / MS_DAY), 'day');
  if (word === 'now') return exact(now / MS_DAY, 'minute');

  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  if (m[2] === undefined) return spanning(daysFromCivil(y, 1, 1), daysFromCivil(y + 1, 1, 1), 'year');

  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  if (m[3] === undefined) {
    const next = mo === 12 ? daysFromCivil(y + 1, 1, 1) : daysFromCivil(y, mo + 1, 1);
    return spanning(daysFromCivil(y, mo, 1), next, 'month');
  }

  const d = Number(m[3]);
  if (d < 1 || d > daysInMonth(y, mo)) return null;
  let t = daysFromCivil(y, mo, d);
  let precision = 'day';
  if (m[4] !== undefined) {
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const sec = m[6] === undefined ? 0 : Number(m[6]);
    if (h > 23 || mi > 59 || sec > 59) return null;
    t += (h * 3600 + mi * 60 + sec) / 86400;
    precision = m[6] === undefined ? 'minute' : 'second';
    if (m[7] && m[7].toUpperCase() !== 'Z') {
      const sign = m[7][0] === '-' ? -1 : 1;
      const digits = m[7].slice(1).replace(':', '');
      const off = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || 0);
      t -= (sign * off) / 1440;
    }
  }
  return exact(t, precision);
}

/** `{ earliest, latest }` gives an explicit uncertainty range. Anything else is delegated to parseDate. */
export function parseRange(input, opts = {}) {
  if (input && typeof input === 'object' && !(input instanceof Date)) {
    const a = parseDate(input.earliest, opts);
    const b = parseDate(input.latest ?? input.earliest, opts);
    if (!a || !b) return null;
    return spanning(Math.min(a.lo, b.lo), Math.max(a.hi, b.hi), 'range');
  }
  return parseDate(input, opts);
}

// ---------------------------------------------------------------------------------------------
// Calendar unit math (used for tick generation). Units: minute, hour, day, week, month, year.

export function floorUnit(t, unit, step = 1) {
  switch (unit) {
    case 'minute': return (Math.floor((t * 1440) / step + 1e-9) * step) / 1440;
    case 'hour': return (Math.floor((t * 24) / step + 1e-9) * step) / 24;
    case 'day': return Math.floor(t + 1e-9);
    case 'week': return Math.floor((Math.floor(t + 1e-9) + 3) / 7) * 7 - 3; // weeks start on Monday
    case 'month': {
      const { y, m } = civilFromDays(t);
      const idx = Math.floor((y * 12 + (m - 1)) / step) * step;
      return daysFromCivil(Math.floor(idx / 12), (((idx % 12) + 12) % 12) + 1, 1);
    }
    case 'year': {
      const { y } = civilFromDays(t);
      return daysFromCivil(Math.floor(y / step) * step, 1, 1);
    }
    default: throw new Error('Unknown unit: ' + unit);
  }
}

export function addUnit(t, unit, step = 1) {
  switch (unit) {
    case 'minute': return t + step / 1440;
    case 'hour': return t + step / 24;
    case 'day': return t + step;
    case 'week': return t + 7 * step;
    case 'month': {
      const { y, m } = civilFromDays(t);
      const idx = y * 12 + (m - 1) + step;
      return daysFromCivil(Math.floor(idx / 12), (((idx % 12) + 12) % 12) + 1, 1);
    }
    case 'year': {
      const { y } = civilFromDays(t);
      return daysFromCivil(y + step, 1, 1);
    }
    default: throw new Error('Unknown unit: ' + unit);
  }
}

// ---------------------------------------------------------------------------------------------
// Formatting. Everything is UTC.

const formatters = new Map();
function fmt(locale, options) {
  const key = locale + JSON.stringify(options);
  let f = formatters.get(key);
  if (!f) formatters.set(key, (f = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options })));
  return f;
}

export const monthName = (m, locale = 'en-GB', width = 'short') =>
  fmt(locale, { month: width }).format(Date.UTC(2001, m - 1, 15));

export const weekdayName = (t, locale = 'en-GB', width = 'short') =>
  fmt(locale, { weekday: width }).format(Math.floor(t) * MS_DAY);

export function yearLabel(y) {
  return y <= 0 ? `${1 - y} BCE` : String(y);
}

function monthOf(t, locale) {
  const { y, m } = civilFromDays(t);
  return `${monthName(m, locale)} ${yearLabel(y)}`;
}

/** Human-readable text for a parsed date, honouring its precision. */
export function formatDate(p, locale = 'en-GB') {
  if (!p) return '';
  if (p.precision === 'range') {
    const a = monthOf(p.lo, locale);
    const b = monthOf(p.hi - 1e-6, locale);
    return a === b ? a : `${a} – ${b}`;
  }
  const { y, m, d } = civilFromDays(p.at);
  if (p.precision === 'year') return yearLabel(y);
  if (p.precision === 'month') return `${monthName(m, locale)} ${yearLabel(y)}`;
  let text = `${d} ${monthName(m, locale)} ${yearLabel(y)}`;
  if (p.precision === 'minute' || p.precision === 'second') {
    const mins = Math.round((p.at - Math.floor(p.at)) * 1440);
    text += `, ${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} UTC`;
  }
  return text;
}

/** Short duration text for a span given in days. */
export function formatDuration(days) {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))} min`;
  if (days < 1) return `${Math.round(days * 24)} h`;
  if (days < 60) return `${Math.round(days)} d`;
  if (days < 730) return `${Math.round(days / 30.4375)} mo`;
  const years = days / 365.2425;
  return `${years < 10 ? Number(years.toFixed(1)) : Math.round(years)} y`;
}
