/**
 * Greedy track packing. `spans` must be sorted by x0 ascending; each span is {x0, x1} in px.
 * Returns the track index of every span and the number of tracks used.
 */
export function packTracks(spans) {
  const ends = [];
  const track = new Array(spans.length);
  for (let i = 0; i < spans.length; i++) {
    const { x0, x1 } = spans[i];
    let t = 0;
    while (t < ends.length && ends[t] > x0) t++;
    if (t === ends.length) ends.push(x1);
    else ends[t] = x1;
    track[i] = t;
  }
  return { track, count: ends.length };
}
