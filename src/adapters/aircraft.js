// Example adapter: per-airframe history from an internal API -> native timeline JSON.
//
// Expected input shape (adjust the mapping below to match your own API):
//   { aircraft: { registration, msn, type },
//     history: [ { type: 'order'|'delivery'|'lease'|'registration'|'operator'|'storage'|'maintenance'
//                         |'modification'|'occurrence',
//                  date | from, to, ...detail fields } ] }
// A missing or null `to` on a span means it is still running.

import { parseDate } from '../core/dates.js';

const LANES = [
  { id: 'ownership', label: 'Ownership' },
  { id: 'registration', label: 'Registration' },
  { id: 'operator', label: 'Operator' },
  { id: 'ground', label: 'Ground' },
  { id: 'occurrences', label: 'Occurrences' },
];

const CATEGORIES = {
  order: { label: 'Order', color: 'light-dark(#6b4fbb, #a995e6)' },
  delivery: { label: 'Delivery', color: 'light-dark(#1b7f5c, #52c79d)' },
  lease: { label: 'Lease', color: 'light-dark(#1f6fb2, #6aaee6)' },
  registration: { label: 'Registration', color: 'light-dark(#5b6b7a, #9fb0bf)' },
  operator: { label: 'Operator', color: 'light-dark(#0f7c8c, #55c3d1)' },
  storage: { label: 'Storage', color: 'light-dark(#8a6d1d, #d6b45a)' },
  check: { label: 'Maintenance', color: 'light-dark(#c2570c, #f0954f)' },
  modification: { label: 'Modification', color: 'light-dark(#a1327a, #e07fbd)' },
  occurrence: { label: 'Occurrence', color: 'light-dark(#b3261e, #f2807a)' },
};

const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ''));
const by = (h, prefix, text) => (text ? `${prefix} ${text}` : '');

function describe(h) {
  switch (h.type) {
    case 'order':
      return { lane: 'ownership', category: 'order', title: `Ordered ${by(h, 'by', h.customer)}`.trim(), data: { Customer: h.customer } };
    case 'delivery':
      return { lane: 'ownership', category: 'delivery', title: `Delivered ${by(h, 'to', h.to_operator)}`.trim(), data: { Operator: h.to_operator } };
    case 'lease':
      return { lane: 'ownership', category: 'lease', title: h.lessee ? `Lease: ${h.lessee}` : 'Lease', data: { Lessor: h.lessor, Lessee: h.lessee } };
    case 'registration':
      return { lane: 'registration', category: 'registration', title: h.registration, data: { Registration: h.registration, Country: h.country } };
    case 'operator':
      return { lane: 'operator', category: 'operator', title: h.operator, data: { Operator: h.operator, Base: h.base } };
    case 'storage':
      return { lane: 'ground', category: 'storage', title: `Stored ${by(h, 'at', h.location)}`.trim(), data: { Location: h.location } };
    case 'maintenance':
      return { lane: 'ground', category: 'check', title: h.check ?? 'Maintenance', data: { Check: h.check, Location: h.location, Provider: h.provider } };
    case 'modification':
      return { lane: 'ground', category: 'modification', title: h.title ?? 'Modification', data: { Location: h.location } };
    default:
      return { lane: 'occurrences', category: 'occurrence', title: h.summary ?? 'Occurrence', data: { Location: h.location, Severity: h.severity } };
  }
}

/**
 * @param {object} api
 * @param {{magnifyChecks?: number|false, maxCheckDays?: number, now?: number}} [options]
 *   magnifyChecks: hot-zone factor applied to each short maintenance span (false disables it).
 */
export function fromAircraft(api, { magnifyChecks = 12, maxCheckDays = 60, now = Date.now() } = {}) {
  const { aircraft = {}, history = [] } = api;
  const events = [];
  const decorators = [{ type: 'point', date: 'today', label: 'Today' }];
  const zones = [];

  history.forEach((h, i) => {
    const d = describe(h);
    const isSpan = h.from != null || h.to !== undefined;
    const ev = {
      id: h.id ?? `h${i}`,
      title: d.title,
      lane: d.lane,
      category: d.category,
      start: h.from ?? h.date,
      description: h.note ?? '',
      confidence: h.confidence,
      data: compact(d.data),
      links: h.source ? [{ href: h.source, label: 'Source' }] : [],
    };
    if (isSpan) {
      if (h.to) ev.end = h.to;
      else ev.ongoing = true;
    }
    events.push(ev);

    if (h.type === 'storage' && h.from && h.to) {
      decorators.push({ type: 'span', start: h.from, end: h.to, label: 'Stored' });
    }
    if (h.type === 'maintenance' && magnifyChecks && h.from && h.to) {
      const a = parseDate(h.from, { now });
      const b = parseDate(h.to, { now });
      const last = zones[zones.length - 1];
      if (a && b && b.hi - a.lo <= maxCheckDays && (!last || a.lo >= last.endDay)) {
        zones.push({ start: h.from, end: h.to, magnify: magnifyChecks, label: h.check ?? 'Check', endDay: b.hi });
      }
    }
  });

  return {
    title: [aircraft.registration, aircraft.type].filter(Boolean).join(' · '),
    lanes: LANES,
    categories: CATEGORIES,
    events,
    decorators,
    hotZones: zones.map(({ endDay, ...z }) => z),
  };
}
