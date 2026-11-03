import { MS_DAY, parseDate } from './core/dates.js';
import { normalize } from './core/model.js';
import { createWarp } from './core/warp.js';
import { Band } from './view/band.js';
import { Controls } from './view/controls.js';
import { div, el, prefersReducedMotion } from './view/dom.js';
import { Filter } from './view/filter.js';
import { attachInteractions } from './view/interactions.js';
import { attachKeyboard } from './view/keyboard.js';
import { createMeasurer } from './view/measure.js';
import { Navigator } from './view/navigator.js';
import { Popovers } from './view/popovers.js';
import { Sync } from './view/sync.js';

let counter = 0;
const DEFAULT_BANDS = [
  { id: 'detail' },
  { id: 'overview', ratio: 'fit', height: 84 },
];

export class StrataTimeline extends HTMLElement {
  static observedAttributes = ['src'];

  uid = `st${++counter}`;
  hintId = `${this.uid}-hint`;
  bubbleId = `${this.uid}-bubble`;
  model = null;
  maxTracks = 14;
  activeId = null;
  labelWidth = 0;
  filterState = new Filter();
  bubbleRenderer = null;

  #built = false;
  #raw = null;
  #bandCfgs = DEFAULT_BANDS;
  #layoutTimer = 0;
  #frameQueued = false;
  #resizeQueued = false;
  #vtDepth = 0;
  #order = null;
  #probe = null;

  get locale() {
    return this.getAttribute('locale') || 'en-GB';
  }

  connectedCallback() {
    if (this.#built) return;
    this.#built = true;
    this.setAttribute('role', 'region');
    if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', 'Timeline');
    this.nav = new Navigator(this);
    this.sync = new Sync(this);
    this.#probe = el('span', 'st-label st-probe', { 'aria-hidden': 'true' });
    this.measure = createMeasurer(() => {
      const s = getComputedStyle(this.#probe);
      return `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    });
    this.bandsEl = div('st-bands');
    this.listEl = div('st-list');
    this.listEl.hidden = true;
    this.controls = new Controls(this);
    this.popovers = new Popovers(this);
    this.append(this.controls.el, this.bandsEl, this.listEl, this.#probe, ...this.popovers.els);
    this.#createBands(this.#bandCfgs);
    attachKeyboard(this);
    new ResizeObserver(() => this.#queueResize()).observe(this.bandsEl);
    if (this.hasAttribute('src')) this.load(this.getAttribute('src')).catch((e) => console.error(e));
    else if (this.#raw) this.#applyData(this.#raw);
  }

  attributeChangedCallback(name, old, value) {
    if (name === 'src' && this.#built && value && value !== old) this.load(value).catch((e) => console.error(e));
  }

  // ---- data -----------------------------------------------------------------------------------

  get data() {
    return this.#raw;
  }

  set data(raw) {
    this.#raw = raw;
    if (this.#built) this.#applyData(raw);
  }

  async load(url, { adapter, init } = {}) {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const json = await res.json();
    this.data = adapter ? adapter(json) : json;
  }

  #applyData(raw) {
    const model = normalize(raw, { now: Date.now() });
    for (const w of model.warnings) console.warn('[strata]', w);
    const swap = () => this.#setModel(model);
    if (this.model) this.transition(swap);
    else swap();
  }

  #setModel(model) {
    this.model = model;
    this.#order = null;
    this.activeId = model.events[0]?.id ?? null;
    if (model.singleLane) this.dataset.single = '';
    else delete this.dataset.single;
    if (model.title && this.getAttribute('aria-label') === 'Timeline') this.setAttribute('aria-label', model.title);
    this.controls.update(model);
    this.nav.ppd = 0;
    this.#layoutAll(true);
  }

  get bands() {
    return this.#bandCfgs;
  }

  set bands(cfgs) {
    this.#bandCfgs = cfgs;
    if (!this.#built) return;
    this.sync.destroy();
    this.#createBands(cfgs);
    if (this.model) this.#layoutAll(true);
  }

  #createBands(cfgs) {
    this.allBands = cfgs.map((c, i) => new Band(this, { ...c, painter: i === 0 ? 'detail' : 'overview' }));
    this.driver = this.allBands[0];
    this.followers = this.allBands.slice(1);
    this.bandsEl.replaceChildren(...this.allBands.map((b) => b.el));
    this.bandsEl.style.gridTemplateRows = this.allBands
      .map((b, i) => (i === 0 ? 'minmax(0, 1fr)' : `${b.cfg.height ?? 72}px`))
      .join(' ');
    attachInteractions(this);
  }

  // ---- layout pipeline ------------------------------------------------------------------------

  #queueResize() {
    if (this.#resizeQueued) return;
    this.#resizeQueued = true;
    requestAnimationFrame(() => {
      this.#resizeQueued = false;
      if (this.model) this.#layoutAll(!this.nav.ppd, !this.driver.model);
    });
  }

  /** Full (re)layout: needs a measured viewport. `rebuild` re-creates band DOM from the model. */
  #layoutAll(reset = false, rebuild = true) {
    const m = this.model;
    const vp = this.driver.viewport;
    if (!m || !vp.clientWidth) return;
    const keep = reset ? null : this.nav.centerTime;
    const parsed = parseFloat(getComputedStyle(vp).getPropertyValue('--st-label-w'));
    this.labelWidth = this.dataset.single !== undefined ? 0 : parsed || 0;
    this.driver.pad = this.labelWidth;
    if (rebuild || reset) {
      const zoned = createWarp(m.zones);
      const plain = createWarp([]);
      for (const b of this.allBands) b.setModel(m, b === this.driver || b.cfg.hotZones ? zoned : plain);
    }
    this.nav.configure();
    if (reset) this.nav.ppd = this.nav.min;
    this.setScales(this.nav.ppd);
    for (const b of this.allBands) b.layout();
    const center = keep ?? this.driver.time(this.driver.width / 2);
    vp.scrollLeft = this.driver.x(center) - this.nav.centerX;
    this.sync.rebuild();
    this.frame(true);
  }

  setScales(ppd) {
    this.driver.setScale(ppd);
    for (const f of this.followers) {
      const fit = f.cfg.ratio === 'fit' || f.cfg.ratio == null;
      f.cfg.mode = fit ? 'static' : 'centered';
      f.inset = fit ? 12 : 0;
      f.setScale(fit ? Math.max((f.viewport.clientWidth - 24) / f.spanDays, 1e-9) : ppd * f.cfg.ratio);
    }
  }

  /** Called after any zoom change: followers are re-linked now, track packing waits until zooming settles. */
  scaleChanged() {
    this.sync.rebuild();
    this.frame(true);
    clearTimeout(this.#layoutTimer);
    this.#layoutTimer = setTimeout(() => {
      for (const b of this.allBands) b.layout();
      this.frame(true);
    }, 140);
    this.emit('strata-zoom', { ppd: this.nav.ppd });
  }

  frame(force = false) {
    const vp = this.driver.viewport;
    const s = vp.scrollLeft;
    this.driver.render(s, s + vp.clientWidth, force);
    for (const f of this.followers) {
      const [x0, x1] = this.sync.window(f, s);
      f.render(x0, x1, force);
    }
  }

  /** Coalesce scroll events into one frame of rendering. */
  queueFrame() {
    if (this.#frameQueued) return;
    this.#frameQueued = true;
    requestAnimationFrame(() => {
      this.#frameQueued = false;
      this.frame();
      this.emit('strata-rangechange', this.visibleRange);
    });
  }

  // ---- public API -----------------------------------------------------------------------------

  get ppd() {
    return this.nav.ppd;
  }

  get visibleRange() {
    const d = this.driver;
    const s = d.viewport.scrollLeft;
    return {
      start: new Date(d.time(s + this.labelWidth) * MS_DAY),
      end: new Date(d.time(s + d.viewport.clientWidth) * MS_DAY),
    };
  }

  scrollToDate(date, opts) {
    const p = parseDate(date);
    return p ? this.nav.moveTo(this.nav.ppd, p.at, opts) : Promise.resolve();
  }

  zoomTo({ start, end }, opts) {
    const a = parseDate(start);
    const b = parseDate(end);
    return a && b ? this.nav.zoomRange(a.lo, b.hi, opts) : Promise.resolve();
  }

  fit(opts) {
    return this.nav.fit(opts);
  }

  zoomBy(factor, anchorX) {
    this.nav.zoomBy(factor, anchorX);
  }

  /** Show only events matching the text (case-insensitive, against title, description, category, lane, data). */
  filter(text = '') {
    this.transition(() => {
      this.filterState.text = String(text).trim().toLowerCase();
      this.#refilter();
    });
  }

  setCategoryHidden(id, hidden) {
    this.transition(() => {
      this.filterState.hiddenCategories[hidden ? 'add' : 'delete'](id);
      this.#refilter();
    });
  }

  setHighlightOnly(on) {
    this.filterState.highlightOnly = Boolean(on);
    this.transition(() => this.#refilter());
  }

  /** Colour events matching any term (event text or category id). Each term gets its own colour slot. */
  highlight(terms = []) {
    this.filterState.terms = terms.map((t) => String(t).toLowerCase());
    this.#syncHl();
    for (const b of this.allBands) {
      b.layoutVersion++;
      b.invalidate();
    }
    this.frame(true);
  }

  isVisibleEvent(ev) {
    return this.filterState.isVisible(ev);
  }

  highlightIndex(ev) {
    return this.filterState.highlightIndex(ev);
  }

  #syncHl() {
    const f = this.filterState;
    this.toggleAttribute('data-hl-active', f.terms.length > 0 || (f.highlightOnly && Boolean(f.text)));
  }

  #refilter() {
    this.#syncHl();
    this.#order = null;
    for (const b of this.allBands) b.layout();
    this.frame(true);
    this.controls.refresh();
    this.emit('strata-filter', { count: this.eventOrder().length });
  }

  /** Visible events in time order. */
  eventOrder() {
    return (this.#order ??= this.model ? this.model.events.filter((e) => this.isVisibleEvent(e)) : []);
  }

  pinnedIds() {
    const focused = this.driver.viewport.contains(document.activeElement) ? document.activeElement.dataset.id : null;
    return [this.activeId, this.popovers.anchorId, focused].filter(Boolean);
  }

  setActive(id, { focus = false, scroll = false } = {}) {
    const ev = this.model?.byId.get(id);
    if (!ev) return null;
    this.activeId = id;
    const vp = this.driver.viewport;
    if (scroll) {
      const x = this.driver.x(ev.at);
      if (x < vp.scrollLeft + this.labelWidth + 24 || x > vp.scrollLeft + vp.clientWidth - 24) {
        vp.scrollLeft = x - this.nav.centerX;
      }
    }
    this.frame(true);
    for (const n of this.driver.nodes.values()) n.tabIndex = n.dataset.id === id ? 0 : -1;
    const node = this.driver.nodes.get(id) ?? null;
    if (node && focus) node.focus({ preventScroll: true });
    if (node && scroll) node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return node;
  }

  /** Make an event the active one and open its bubble. */
  select(id) {
    const node = this.setActive(id, { focus: true, scroll: true });
    if (node) this.popovers.openFor(node);
  }

  /** Run a discrete change inside an element-scoped view transition, so the rest of the page stays live. */
  transition(update) {
    if (!this.model || prefersReducedMotion() || !('startViewTransition' in Element.prototype)) {
      update();
      return Promise.resolve();
    }
    this.classList.add('st-vt');
    this.#vtDepth++;
    const t = this.startViewTransition(update);
    t.ready.catch(() => {});
    return t.finished.catch(() => {}).finally(() => {
      if (--this.#vtDepth === 0) this.classList.remove('st-vt');
    });
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }
}

if (!customElements.get('strata-timeline')) customElements.define('strata-timeline', StrataTimeline);
