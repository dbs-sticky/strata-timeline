/**
 * Static interval index. Items need numeric `lo` and `hi` (lo <= hi).
 * Sorted by lo with a prefix maximum of hi, so a window query stops as soon as nothing earlier can reach it.
 */
export class IntervalIndex {
  constructor(items) {
    this.items = [...items].sort((x, y) => x.lo - y.lo || x.hi - y.hi);
    this.maxHi = new Float64Array(this.items.length);
    let max = -Infinity;
    for (let i = 0; i < this.items.length; i++) {
      max = Math.max(max, this.items[i].hi);
      this.maxHi[i] = max;
    }
  }

  get size() {
    return this.items.length;
  }

  /** Items overlapping [a, b], ascending by lo. */
  query(a, b) {
    const items = this.items;
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (items[mid].lo <= b) lo = mid + 1;
      else hi = mid;
    }
    const out = [];
    for (let i = lo - 1; i >= 0 && this.maxHi[i] >= a; i--) {
      if (items[i].hi >= a) out.push(items[i]);
    }
    return out.reverse();
  }
}
