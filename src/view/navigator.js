import { clamp, prefersReducedMotion } from './dom.js';

/** Zoom and position of the driver band. `ppd` is pixels per band day. */
export class Navigator {
  constructor(tl) {
    this.tl = tl;
    this.ppd = 1;
    this.min = 0.001;
    this.max = 1000;
    this.raf = 0;
  }

  get d() {
    return this.tl.driver;
  }

  /** X (in viewport px) of the middle of the area not covered by the sticky lane labels. */
  get centerX() {
    const V = this.d.viewport.clientWidth;
    return this.tl.labelWidth + (V - this.tl.labelWidth) / 2;
  }

  get centerTime() {
    return this.d.time(this.d.viewport.scrollLeft + this.centerX);
  }

  /** Recompute zoom limits. The canvas is capped near 8M px, below browser layout limits. */
  configure() {
    const d = this.d;
    const usable = Math.max(d.viewport.clientWidth - this.tl.labelWidth, 120);
    this.min = usable / d.spanDays;
    this.max = Math.max(Math.min(8e6 / d.spanDays, 120000), this.min);
    this.ppd = clamp(this.ppd, this.min, this.max);
  }

  #set(ppd, keepTime, keepX) {
    this.ppd = clamp(ppd, this.min, this.max);
    this.tl.setScales(this.ppd);
    this.d.viewport.scrollLeft = this.d.x(keepTime) - keepX;
    this.tl.scaleChanged();
  }

  /** Zoom by a factor keeping the date under anchorX (viewport px) fixed. */
  zoomBy(factor, anchorX = this.centerX) {
    this.cancel();
    const t = this.d.time(this.d.viewport.scrollLeft + anchorX);
    if (clamp(this.ppd * factor, this.min, this.max) === this.ppd) return;
    this.#set(this.ppd * factor, t, anchorX);
  }

  /** Move to a zoom level and centre time, animated unless reduced motion is requested. */
  moveTo(ppd, centerTime, { animate = true } = {}) {
    this.cancel();
    ppd = clamp(ppd, this.min, this.max);
    if (!animate || prefersReducedMotion()) {
      this.#set(ppd, centerTime, this.centerX);
      return Promise.resolve();
    }
    const W = this.d.warp;
    const p0 = this.ppd;
    const w0 = W.W(this.centerTime);
    const w1 = W.W(centerTime);
    const start = performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        const k = Math.min(1, (now - start) / 320);
        const e = 1 - (1 - k) ** 3;
        this.#set(Math.exp(Math.log(p0) + (Math.log(ppd) - Math.log(p0)) * e), W.inv(w0 + (w1 - w0) * e), this.centerX);
        if (k < 1) this.raf = requestAnimationFrame(step);
        else resolve();
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  /** Fit the real-time range [t0, t1] into the visible area. */
  zoomRange(t0, t1, opts) {
    const W = this.d.warp;
    const usable = this.d.viewport.clientWidth - this.tl.labelWidth;
    const span = Math.max(W.W(t1) - W.W(t0), 1e-6);
    return this.moveTo((usable * 0.94) / span, W.inv((W.W(t0) + W.W(t1)) / 2), opts);
  }

  fit(opts) {
    return this.moveTo(this.min, this.d.time(this.d.width / 2), opts);
  }

  cancel() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
