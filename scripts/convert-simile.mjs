// One-off converter: SIMILE Timeline XML event files -> Strata native JSON.
// Usage: node scripts/convert-simile.mjs lane=file.xml [lane=file.xml ...] > out.json
import { readFileSync } from 'node:fs';

const pad4 = (n) => String(Math.abs(n)).padStart(4, '0');
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

function toIso(s) {
  if (s == null) return null;
  s = s.trim();
  let m = /^(\d+)\s*(BC|AD)?$/i.exec(s);
  if (m) {
    const y = m[2]?.toUpperCase() === 'BC' ? 1 - Number(m[1]) : Number(m[1]);
    return (y < 0 ? '-' : '') + pad4(y);
  }
  m = /^([A-Za-z]{3}) (\d\d) (\d{4})/.exec(s);
  if (m && MONTHS[m[1]]) return `${m[3]}-${String(MONTHS[m[1]]).padStart(2, '0')}-${m[2]}`;
  return null;
}

const decode = (t) =>
  t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function parseAttrs(src) {
  const attrs = {};
  for (const m of src.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)) attrs[m[1]] = decode(m[3]);
  return attrs;
}

function convert(xml, lane) {
  const events = [];
  const warnings = [];
  for (const m of xml.matchAll(/<event\s+((?:[^>"']|"[^"]*"|'[^']*')*?)(\/>|>([\s\S]*?)<\/event>)/g)) {
    const a = parseAttrs(m[1]);
    const html = decode(m[3] ?? '');
    const links = [...html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gs)].map((l) => ({ href: l[1], label: l[2].replace(/<[^>]+>/g, '') }));
    const description = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const start = toIso(a.start);
    if (!start) { warnings.push(`${lane}: bad start ${a.start} (${a.title})`); continue; }
    const end = toIso(a.end);
    const duration = a.isDuration === 'true' || a.durationEvent === 'true';
    const ev = { title: a.title ?? '', lane, start, description, links: links.slice(0, 6) };
    if (a.latestStart) ev.start = { earliest: start, latest: toIso(a.latestStart) ?? start };
    if (duration && end) ev.end = a.earliestEnd ? { earliest: toIso(a.earliestEnd) ?? end, latest: end } : end;
    else if (end) ev.start = { earliest: start, latest: end }; // imprecise instant
    if (a.color) ev.color = a.color;
    if (a.image) ev.image = a.image;
    if (a.link) ev.links.unshift({ href: a.link, label: 'Link' });
    events.push(ev);
  }
  return { events, warnings };
}

const lanes = [];
const events = [];
for (const arg of process.argv.slice(2)) {
  const [lane, file] = arg.split('=');
  const { events: evs, warnings } = convert(readFileSync(file, 'utf8'), lane);
  lanes.push({ id: lane, label: lane[0].toUpperCase() + lane.slice(1) });
  events.push(...evs);
  for (const w of warnings.slice(0, 8)) console.error(w);
  console.error(`${lane}: ${evs.length} events, ${warnings.length} skipped`);
}
console.log(JSON.stringify({ lanes, events }));
