import { buildAxis } from '../core/scale.js';
import { eventWhen } from '../core/model.js';
import { div, el, setVars } from './dom.js';

const ONGOING_FADE_PX = 56;

function makeEvent(band, e) {
  const { tl } = band;
  const btn = el('button', e.className ? `st-ev ${e.className}` : 'st-ev', {
    type: 'button',
    interestfor: tl.hintId,
    commandfor: tl.bubbleId,
    command: 'show-popover',
    tabindex: '-1',
    'aria-label': `${e.title}, ${eventWhen(e, tl.locale)}`,
  });
  btn.dataset.id = e.id;
  btn.dataset.kind = e.kind;
  if (e.category) btn.dataset.cat = e.category;
  if (e.confidence) btn.dataset.confidence = e.confidence;
  if (e.ongoing) btn.dataset.ongoing = '';
  if (e.color) btn.style.setProperty('--c', e.color);
  const label = el('span', 'st-label');
  label.textContent = e.title;
  btn.append(el('span', e.kind === 'span' ? 'st-tape' : 'st-dot'), label);
  return btn;
}

function makeOverview(band, e) {
  const node = el('i', 'st-ov');
  node.dataset.kind = e.kind;
  if (e.color) node.style.setProperty('--c', e.color);
  return node;
}

function update(band, node, e) {
  const { warp, o } = band;
  const place = band.place.get(e.id) ?? { track: 0, lbl: 'out' };
  const s = warp.W(e.kind === 'span' ? e.a : e.at) - o;
  const vars = { '--s': s, '--tr': place.track };
  if (e.kind === 'span') {
    vars['--w'] = warp.W(e.d) - o - s;
    vars['--rs'] = warp.W(e.b) - o - s;
    vars['--re'] = warp.W(e.d) - warp.W(e.c);
    vars['--fade'] = e.ongoing ? `${ONGOING_FADE_PX}px` : '0px';
  }
  setVars(node, vars);
  node.dataset.lbl = place.lbl;
  const hl = band.tl.highlightIndex(e);
  if (hl >= 0) node.dataset.hl = hl;
  else delete node.dataset.hl;
  node._v = band.layoutVersion;
}

/** Diff the rendered event nodes against the events inside the render window (plus pinned ones). */
export function paintEvents(band, found) {
  const { tl } = band;
  const want = new Map();
  for (const e of found) if (tl.isVisibleEvent(e)) want.set(e.id, e);
  for (const id of tl.pinnedIds()) {
    const e = tl.model.byId.get(id);
    if (e && tl.isVisibleEvent(e)) want.set(id, e);
  }
  for (const [id, node] of band.nodes) {
    if (!want.has(id)) {
      node.remove();
      band.nodes.delete(id);
    }
  }
  for (const e of want.values()) {
    let node = band.nodes.get(e.id);
    if (!node) {
      node = band.painter === 'detail' ? makeEvent(band, e) : makeOverview(band, e);
      band.nodes.set(e.id, node);
      (band.painter === 'detail' ? band.laneEls[e.laneIndex] : band.body).append(node);
    }
    if (node._v !== band.layoutVersion) update(band, node, e);
    if (band.painter === 'detail') node.tabIndex = tl.activeId === e.id ? 0 : -1;
  }
}

/** Axis rows and grid lines for the real-time range [a, b]. */
export function paintAxis(band, a, b) {
  const { tl, warp, o } = band;
  const { minor, major } = buildAxis(warp, a, b, band.ppd, {
    locale: tl.locale,
    minPx: band.painter === 'detail' ? 72 : 56,
  });
  const bd = (t) => warp.W(t) - o;
  const majors = new DocumentFragment();
  const minors = new DocumentFragment();
  const grid = new DocumentFragment();
  const strong = new Set(major.map((c) => c.t0));
  for (const c of major) {
    const cell = div('st-major');
    setVars(cell, { '--s': bd(c.t0), '--w': bd(c.t1) - bd(c.t0) });
    const label = el('span', 'st-major-label');
    label.textContent = c.label;
    cell.append(label);
    majors.append(cell);
  }
  for (const m of minor) {
    const tick = div('st-minor');
    tick.style.setProperty('--s', bd(m.t));
    const label = el('span', 'st-minor-label');
    label.textContent = m.label;
    tick.append(label);
    minors.append(tick);
    const line = div('st-gridline');
    line.style.setProperty('--s', bd(m.t));
    if (strong.has(m.t)) line.dataset.strong = '';
    grid.append(line);
  }
  band.axisMajor.replaceChildren(majors);
  band.axisMinor.replaceChildren(minors);
  band.gridEl.replaceChildren(grid);
}

/** Hot-zone shading and decorators. Positions use band days, so this only reruns when the model changes. */
export function paintStatic(band) {
  const { model, warp, o } = band;
  const detail = band.painter === 'detail';
  const bd = (t) => warp.W(t) - o;
  const frag = new DocumentFragment();
  const label = (text, cls) => {
    const l = el('span', cls);
    l.textContent = text;
    return l;
  };
  for (const z of model.zones) {
    const node = div('st-zone');
    node.dataset.kind = z.magnify > 1 ? 'magnify' : 'compress';
    setVars(node, { '--s': bd(z.start), '--w': bd(z.end) - bd(z.start) });
    if (detail) node.append(label(`${z.label ? `${z.label} ` : ''}×${+z.magnify.toFixed(2)}`, 'st-zone-label'));
    frag.append(node);
  }
  for (const d of model.decorators) {
    const node = div(d.className ? `st-deco ${d.className}` : 'st-deco');
    node.dataset.type = d.type;
    if (d.color) node.style.setProperty('--c', d.color);
    if (d.type === 'span') setVars(node, { '--s': bd(d.lo), '--w': bd(d.hi) - bd(d.lo) });
    else node.style.setProperty('--s', bd(d.at));
    if (detail && d.label) node.append(label(d.label, 'st-deco-label'));
    frag.append(node);
  }
  band.staticEl.replaceChildren(frag);
}
