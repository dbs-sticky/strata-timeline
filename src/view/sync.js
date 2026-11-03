/**
 * Keeps follower bands locked to the driver band without running JS per scroll event.
 *
 * The centre of the driver viewport at scroll s is the real time c(s) = driver.time(s + V1/2).
 * A "centered" follower translates its canvas so that same time sits at its own centre; a "static" follower
 * (whole-domain overview) stays put. Both draw the driver visible window as two shades whose edges are
 * piecewise linear in s, because hot zones bend the time mapping. Each is a Web Animation on a ScrollTimeline
 * with keyframes at every point where the slope changes, so it runs on the compositor.
 */
export class Sync {
  constructor(tl) {
    this.tl = tl;
    this.anims = [];
  }

  destroy() {
    for (const a of this.anims) a.cancel();
    this.anims = [];
  }

  #maps(f) {
    const d = this.tl.driver;
    const V1 = d.viewport.clientWidth;
    const V2 = f.viewport.clientWidth;
    const centered = f.cfg.mode !== 'static';
    const cT = (s) => d.time(s + V1 / 2);
    const T = (s) => (centered ? V2 / 2 - f.x(cT(s)) : (f.inset ?? 0));
    const edge = (s, off) => f.x(d.time(s + off)) + T(s);
    return { d, V1, V2, centered, cT, T, xL: (s) => edge(s, d.pad), xR: (s) => edge(s, V1) };
  }

  /** Visible canvas pixel range of a follower when the driver is scrolled to s. */
  window(f, s) {
    const { V2, centered, cT } = this.#maps(f);
    if (!centered) return [-(f.inset ?? 0), V2 - (f.inset ?? 0)];
    const xc = f.x(cT(s));
    return [xc - V2 / 2, xc + V2 / 2];
  }

  /** Driver scroll position that puts real time t at the centre of the driver viewport. */
  scrollForTime(t) {
    const d = this.tl.driver;
    return d.x(t) - d.viewport.clientWidth / 2;
  }

  rebuild() {
    this.destroy();
    const { driver: d, followers } = this.tl;
    const vp = d.viewport;
    const S = vp.scrollWidth - vp.clientWidth;
    for (const f of followers) {
      const m = this.#maps(f);
      if (!m.V2) continue;
      const base = (node, x) => (node.style.translate = `${x}px 0px`);
      base(f.canvas, m.T(0));
      base(f.shadeL, m.xL(0) - m.V2);
      base(f.shadeR, m.xR(0));
      if (S <= 0 || typeof ScrollTimeline !== 'function') continue;

      const stops = new Set([0, S]);
      for (const b of [...d.warp.breakpoints, ...f.warp.breakpoints]) {
        const at = d.x(b);
        for (const off of [d.pad, m.V1 / 2, m.V1]) {
          const s = at - off;
          if (s > 0.01 && s < S - 0.01) stops.add(s);
        }
      }
      const sorted = [...stops].sort((a, b) => a - b);
      const timeline = new ScrollTimeline({ source: vp, axis: 'inline' });
      const link = (node, fn) => {
        const frames = sorted.map((s) => ({ offset: s / S, translate: `${fn(s)}px 0px` }));
        const anim = new Animation(new KeyframeEffect(node, frames, { fill: 'both', easing: 'linear' }), timeline);
        anim.play();
        this.anims.push(anim);
      };
      if (m.centered) link(f.canvas, m.T);
      link(f.shadeL, (s) => m.xL(s) - m.V2);
      link(f.shadeR, m.xR);
    }
  }
}
