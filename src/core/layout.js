/**
 * Greedy track packing. `spans` must be sorted by x0 ascending; each span is {x0, x1} in px.
 * Returns the track index of every span and the number of tracks used.
 */
export function packTracks(spans) {
  // Busy tracks are ordered by end, free tracks by index: O(n log tracks),
  // while preserving the original lowest-free-track assignment.
  const busy = new Heap((a, b) => a.end - b.end || a.id - b.id);
  const free = new Heap((a, b) => a - b);
  let count = 0;
  const track = new Array(spans.length);
  for (let i = 0; i < spans.length; i++) {
    const { x0, x1 } = spans[i];
    while (busy.size && busy.peek.end <= x0) free.push(busy.pop().id);
    const t = free.size ? free.pop() : count++;
    busy.push({ end: x1, id: t });
    track[i] = t;
  }
  return { track, count };
}

class Heap {
  constructor(compare) { this.items = []; this.compare = compare; }
  get size() { return this.items.length; }
  get peek() { return this.items[0]; }
  push(value) {
    const a = this.items;
    let i = a.length;
    a.push(value);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(a[p], value) <= 0) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = value;
  }
  pop() {
    const a = this.items;
    const first = a[0];
    const last = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let c = i * 2 + 1;
        if (c + 1 < a.length && this.compare(a[c + 1], a[c]) < 0) c++;
        if (this.compare(last, a[c]) <= 0) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = last;
    }
    return first;
  }
}
