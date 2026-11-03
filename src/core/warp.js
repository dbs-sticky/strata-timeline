// Hot zones: a piecewise-linear map W from real days to "band days".
// Inside a zone the slope is its magnify factor (nested zones multiply). A factor above 1 stretches time,
// below 1 compresses it. W(t) = t before the first breakpoint, so a band without zones is the identity.

const upperBound = (arr, x) => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const IDENTITY = Object.freeze({
  isIdentity: true,
  zones: [],
  breakpoints: [],
  W: (t) => t,
  inv: (w) => w,
  slopeAt: () => 1,
  segments: (a, b) => (b > a ? [{ from: a, to: b, slope: 1 }] : []),
});

/** @param {{start:number,end:number,magnify:number}[]} zones real-day coordinates */
export function createWarp(zones = []) {
  const list = zones.filter(
    (z) => Number.isFinite(z.start) && Number.isFinite(z.end) && z.end > z.start && z.magnify > 0 && z.magnify !== 1,
  );
  if (!list.length) return IDENTITY;

  const bp = [...new Set(list.flatMap((z) => [z.start, z.end]))].sort((a, b) => a - b);
  const n = bp.length;
  const slopes = [];
  const wAt = [bp[0]];
  for (let i = 0; i < n - 1; i++) {
    const mid = (bp[i] + bp[i + 1]) / 2;
    let slope = 1;
    for (const z of list) if (z.start <= mid && mid <= z.end) slope *= z.magnify;
    slopes.push(slope);
    wAt.push(wAt[i] + slope * (bp[i + 1] - bp[i]));
  }

  const W = (t) => {
    if (t <= bp[0]) return t;
    if (t >= bp[n - 1]) return wAt[n - 1] + (t - bp[n - 1]);
    const i = upperBound(bp, t) - 1;
    return wAt[i] + slopes[i] * (t - bp[i]);
  };

  const inv = (w) => {
    if (w <= wAt[0]) return w;
    if (w >= wAt[n - 1]) return bp[n - 1] + (w - wAt[n - 1]);
    const i = upperBound(wAt, w) - 1;
    return bp[i] + (w - wAt[i]) / slopes[i];
  };

  const slopeAt = (t) => {
    if (t < bp[0] || t >= bp[n - 1]) return 1;
    return slopes[upperBound(bp, t) - 1];
  };

  /** Constant-slope pieces covering [a, b]. */
  const segments = (a, b) => {
    const out = [];
    if (!(b > a)) return out;
    let from = a;
    for (const cut of bp) {
      if (cut <= from) continue;
      if (cut >= b) break;
      out.push({ from, to: cut, slope: slopeAt((from + cut) / 2) });
      from = cut;
    }
    out.push({ from, to: b, slope: slopeAt((from + b) / 2) });
    return out;
  };

  return { isIdentity: false, zones: list, breakpoints: bp, W, inv, slopeAt, segments };
}
