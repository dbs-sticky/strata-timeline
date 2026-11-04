import { IntervalIndex } from '../core/interval-index.js';
import { div, el } from './dom.js';
import { layoutBand } from './band-layout.js';
import { paintAxis, paintEvents, paintStatic } from './band-paint.js';
import { paintOverview } from './overview.js';

/**
 * One horizontal band. The first band is the driver: its viewport is a real scroll container.
 * Follower bands are clipped and moved by scroll-linked animations (see sync.js).
 * Coordinates: "band days" are warped days (hot zones); x = (W(t) - origin) * ppd in canvas pixels.
 */
export class Band {
  constructor(tl, cfg) {
    this.tl = tl;
    this.cfg = cfg;
    this.painter = cfg.painter ?? 'detail';
    this.nodes = new Map();
    this.laneEls = [];
    this.place = new Map();
    this.layoutVersion = 0;
    this.rendered = [0, -1];
    this.renderedY = [0, -1];
    this.trackIndex = null;
    this.scaleKey = null;
    this.ppd = 1;
    this.o = 0;
    this.pad = 0; // px reserved before the domain start (the sticky lane label column)
    this.spanDays = 1;

    this.el = div('st-band');
    this.el.dataset.painter = this.painter;
    this.el.dataset.band = cfg.id;
    this.viewport = div('st-viewport');
    this.canvas = div('st-canvas');
    this.under = div('st-under');
    this.staticEl = div('st-static');
    this.gridEl = div('st-grid');
    this.under.append(this.staticEl, this.gridEl);
    this.body = div('st-body');
    this.axis = div('st-axis');
    this.axisMajor = div('st-major-row');
    this.axisMinor = div('st-minor-row');
    this.axis.append(this.axisMajor, this.axisMinor);
    this.canvas.append(this.under, this.body, this.axis);
    this.viewport.append(this.canvas);
    if (this.painter === 'overview') {
      this.shadeL = div('st-shade st-shade-l');
      this.shadeR = div('st-shade st-shade-r');
      this.viewport.append(this.shadeL, this.shadeR);
      this.viewport.dataset.follower = '';
    }
    this.el.append(this.viewport);
    if (cfg.height) this.el.style.setProperty('--band-h', `${cfg.height}px`);
  }

  axisHeight() {
    return this.axis.offsetHeight;
  }

  get width() {
    return Math.ceil(this.spanDays * this.ppd + this.pad);
  }

  x(t) {
    return (this.warp.W(t) - this.o) * this.ppd + this.pad;
  }

  time(x) {
    return this.warp.inv(this.o + (x - this.pad) / this.ppd);
  }

  setModel(model, warp) {
    this.model = model;
    this.warp = warp;
    this.index = new IntervalIndex(model.events);
    for (const node of this.nodes.values()) node.remove();
    this.nodes.clear();
    this.place.clear();
    this.o = warp.W(model.domain.t0);
    this.spanDays = warp.W(model.domain.t1) - this.o;
    this.laneEls = [];
    this.body.replaceChildren();
    if (this.painter === 'overview') {
      this.raster = el('canvas', 'st-overview-raster', { 'aria-hidden': 'true' });
      this.colorProbe = el('i', 'st-ov st-color-probe', { 'aria-hidden': 'true' });
      this.body.append(this.raster, this.colorProbe);
    }
    if (this.painter === 'detail') {
      for (const lane of model.lanes) {
        const laneEl = div('st-lane', { role: 'group', 'aria-label': lane.label || 'Events' });
        laneEl.dataset.lane = lane.id;
        const label = div('st-lane-label');
        const text = el('span', 'st-lane-text');
        text.textContent = lane.label;
        label.append(text);
        laneEl.append(label);
        this.laneEls.push(laneEl);
        this.body.append(laneEl);
      }
    }
    paintStatic(this);
    this.scaleKey = null;
    this.invalidate();
  }

  setScale(ppd) {
    this.ppd = ppd;
    const key = `${ppd}/${this.width}/${this.pad}`;
    if (key === this.scaleKey) return;
    this.scaleKey = key;
    this.canvas.style.width = `${this.width}px`;
    this.el.style.setProperty('--ppd', ppd);
    this.el.style.setProperty('--st-pad', `${this.pad}px`);
    this.invalidate();
  }

  invalidate() {
    this.rendered = [0, -1];
  }

  layout() {
    layoutBand(this);
    this.trackIndex = null;
    this.invalidate();
  }

  /** Capture lane geometry in one read phase, after packing has set all heights. */
  measureTracks() {
    const lanes = this.laneEls.map((lane) => {
      const style = getComputedStyle(lane);
      return {
        top: lane.offsetTop,
        row: parseFloat(style.getPropertyValue('--row')),
        height: parseFloat(style.getPropertyValue('--st-tape-h')),
        compact: lane.hasAttribute('data-compact'),
      };
    });
    const items = [];
    for (const [id, place] of this.place) {
      const event = this.model.byId.get(id);
      const lane = lanes[event.laneIndex];
      const lo = lane.top + 8 + place.track * lane.row;
      items.push({ lo, hi: lo + (lane.compact ? 8 : lane.height), event });
    }
    this.trackIndex = new IntervalIndex(items);
  }

  /** Render what is needed for the visible pixel range [vx0, vx1] of the canvas, plus a buffer either side. */
  render(vx0, vx1, force = false) {
    const V = Math.max(vx1 - vx0, 1);
    const [r0, r1] = this.rendered;
    const horizontal = vx0 - r0 < V * 0.4 || r1 - vx1 < V * 0.4;
    const H = this.viewport.clientHeight;
    const y = this.viewport.scrollTop;
    const [y0, y1] = this.renderedY;
    const vertical = this.painter === 'detail' && (y - y0 < H * 0.1 || y1 - y - H < H * 0.1);
    if (!force && !horizontal && !vertical) return false;
    const p0 = horizontal ? vx0 - V : r0;
    const p1 = horizontal ? vx1 + V : r1;
    this.rendered = [p0, p1];
    const a = this.time(p0);
    const b = this.time(p1);
    if (this.painter === 'detail') {
      if (!this.trackIndex) this.measureTracks();
      this.renderedY = [y - H * 0.25, y + H * 1.25];
      const found = this.trackIndex.query(...this.renderedY)
        .map((item) => item.event).filter((e) => e.lo <= b && e.hi >= a);
      paintEvents(this, found);
    } else paintOverview(this, this.index.query(a, b), p0, p1);
    if (horizontal) paintAxis(this, a, b);
    return true;
  }
}
