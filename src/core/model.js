import { MS_DAY, formatDate, formatDuration, parseDate } from './dates.js';

const HUES = [255, 25, 150, 330, 85, 200, 290, 55, 175, 5];
export const autoColor = (i) =>
  `light-dark(oklch(0.52 0.15 ${HUES[i % HUES.length]}), oklch(0.76 0.12 ${HUES[i % HUES.length]}))`;

// Only http(s), mailto, relative and same-page links (and data images for pictures) are allowed through.
const SAFE_HREF = /^(https?:|mailto:|\/|\.|#|[\w-]+\/)/i;
const SAFE_IMAGE = /^(https?:|\/|\.|data:image\/(png|jpe?g|gif|webp|svg\+xml);)/i;
export const safeHref = (v) => (typeof v === 'string' && SAFE_HREF.test(v.trim()) ? v.trim() : null);
export const safeImage = (v) => (typeof v === 'string' && SAFE_IMAGE.test(v.trim()) ? v.trim() : null);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Turn the native JSON format into the internal model: parsed dates, lanes, categories, sorted events,
 * decorators, hot zones and the overall time domain. Invalid entries are skipped and reported in `warnings`.
 */
export function normalize(raw = {}, { now = Date.now() } = {}) {
  const warnings = [];
  const opts = { now };
  const nowDay = now / MS_DAY;

  const lanes = [];
  const laneById = new Map();
  const lane = (id, label) => {
    let l = laneById.get(id);
    if (!l) laneById.set(id, (l = { id, label: label ?? id, index: lanes.length })), lanes.push(l);
    return l;
  };
  for (const l of raw.lanes ?? []) lane(String(l.id), l.label ?? String(l.id));

  const categories = new Map();
  let colorIndex = 0;
  const category = (id, def = {}) => {
    let c = categories.get(id);
    if (!c) categories.set(id, (c = { id, label: def.label ?? id, color: def.color ?? autoColor(colorIndex++) }));
    return c;
  };
  for (const [id, def] of Object.entries(raw.categories ?? {})) category(id, def);

  const events = [];
  const ids = new Set();
  (raw.events ?? []).forEach((r, i) => {
    const name = `Event ${i} (${r.title ?? 'untitled'})`;
    const start = parseDate(r.start, opts);
    if (!start) return warnings.push(`${name} skipped: invalid start`);
    let end = null;
    let ongoing = false;
    if (r.end != null) {
      end = parseDate(r.end, opts);
      if (!end) return warnings.push(`${name} skipped: invalid end`);
    } else if (r.ongoing) {
      end = { lo: nowDay, hi: nowDay, at: nowDay, precision: 'ongoing' };
      ongoing = true;
    }

    const span = end != null;
    let a = start.lo;
    let b = start.hi;
    let c = null;
    let d = null;
    if (span) {
      c = end.lo;
      d = end.hi;
      if (d < a) return warnings.push(`${name} skipped: ends before it starts`);
      if (b > c) b = c = clamp((b + c) / 2, a, d);
    }

    let id = String(r.id ?? `e${i}`);
    while (ids.has(id)) id += '_';
    ids.add(id);

    const laneId = r.lane != null ? String(r.lane) : (lanes[0]?.id ?? '');
    const ln = lane(laneId, laneId);
    const cat = r.category != null ? category(String(r.category)) : null;
    const links = (r.links ?? (r.link ? [{ href: r.link }] : []))
      .map((l) => ({ href: safeHref(l.href), label: l.label ?? l.href }))
      .filter((l) => l.href);
    const data = r.data && typeof r.data === 'object' ? r.data : {};

    events.push({
      id,
      title: String(r.title ?? ''),
      description: r.description == null ? '' : String(r.description),
      lane: laneId,
      laneIndex: ln.index,
      category: cat?.id ?? null,
      color: r.color ?? cat?.color ?? null,
      className: r.className ? String(r.className) : '',
      image: safeImage(r.image),
      links,
      data,
      confidence: r.confidence ?? null,
      kind: span ? 'span' : 'instant',
      ongoing,
      a, b, c, d,
      at: span ? (b + c) / 2 : start.at,
      lo: a,
      hi: span ? d : b,
      start,
      end,
      text: [r.title, r.description, cat?.label, laneId, ...Object.values(data)].filter((v) => v != null).join(' ').toLowerCase(),
    });
  });
  events.sort((x, y) => x.a - y.a || x.hi - y.hi);
  events.forEach((e, i) => (e.index = i));

  const decorators = [];
  for (const dc of raw.decorators ?? []) {
    if (dc.type === 'point') {
      const p = parseDate(dc.date ?? dc.at, opts);
      if (p) decorators.push({ type: 'point', at: p.at, label: dc.label ?? '', color: dc.color ?? null, className: dc.className ?? '' });
    } else {
      const s = parseDate(dc.start, opts);
      const e = parseDate(dc.end, opts);
      if (s && e && e.at > s.at) decorators.push({ type: 'span', lo: s.at, hi: e.at, label: dc.label ?? '', color: dc.color ?? null, className: dc.className ?? '' });
    }
  }

  const zones = [];
  for (const z of raw.hotZones ?? []) {
    const s = parseDate(z.start, opts);
    const e = parseDate(z.end, opts);
    const magnify = Number(z.magnify);
    if (s && e && e.hi > s.lo && magnify > 0) zones.push({ start: s.lo, end: e.hi, magnify, unit: z.unit ?? null, label: z.label ?? '' });
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (const e of events) (lo = Math.min(lo, e.lo)), (hi = Math.max(hi, e.hi));
  for (const dc of decorators) (lo = Math.min(lo, dc.lo ?? dc.at)), (hi = Math.max(hi, dc.hi ?? dc.at));
  for (const z of zones) (lo = Math.min(lo, z.start)), (hi = Math.max(hi, z.end));
  if (!Number.isFinite(lo)) (lo = nowDay - 30), (hi = nowDay + 30);
  const pad = Math.max((hi - lo) * 0.04, 2);

  if (!lanes.length) lane('', '');
  return {
    title: raw.title ?? '',
    lanes,
    singleLane: lanes.length === 1 && !lanes[0].label,
    categories,
    events,
    byId: new Map(events.map((e) => [e.id, e])),
    decorators,
    zones,
    domain: { t0: lo - pad, t1: hi + pad },
    now: nowDay,
    warnings,
  };
}

/** "27 Jul 2019 – Jul 2031 (12 y)" style text for an event. */
export function eventWhen(ev, locale = 'en-GB') {
  const from = formatDate(ev.start, locale);
  if (ev.kind === 'instant') return from;
  const to = ev.ongoing ? 'present' : formatDate(ev.end, locale);
  const dur = formatDuration(ev.d - ev.a);
  return `${from} – ${to} (${dur})`;
}
