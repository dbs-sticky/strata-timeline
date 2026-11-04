import { packTracks } from '../core/layout.js';

const MARK = 14; // width of an instant marker
const GAP = 10; // minimum space between neighbours on the same track
const MIN_TAPE = 6;
const LABEL_PAD = 14; // room needed inside a tape before its label fits there
const LABEL_GAP = 6;

/** Assign every visible event a track (and whether its label sits inside the tape) for the band scale. */
export function layoutBand(band) {
  const { tl, model } = band;
  band.layoutVersion++;
  band.place = new Map();
  const visible = model.events.filter((e) => tl.isVisibleEvent(e));
  if (band.painter === 'overview') return layoutOverview(band, visible);
  const byLane = model.lanes.map(() => []);
  tl.measure.refresh();
  for (const e of visible) byLane[e.laneIndex].push(e);
  byLane.forEach((items, li) => layoutLane(band, li, items));
}

function pack(items, spans) {
  const order = items.map((_, i) => i).sort((p, q) => spans[p].x0 - spans[q].x0);
  const { track, count } = packTracks(order.map((i) => spans[i]));
  const tracks = new Array(items.length);
  order.forEach((i, k) => (tracks[i] = track[k]));
  return { tracks, count };
}

function layoutLane(band, li, items) {
  const { tl } = band;
  const px = (t) => band.x(t);
  const build = (labels) =>
    items.map((e) => {
      const lw = labels ? tl.measure(e.title) : 0;
      if (e.kind === 'instant') {
        const x = px(e.at);
        return { x0: x - MARK / 2, x1: x + MARK / 2 + (labels ? LABEL_GAP + lw : 0) + GAP, lbl: 'out' };
      }
      const x0 = px(e.a);
      const w = Math.max(px(e.d) - x0, MIN_TAPE);
      const inside = labels && w >= lw + LABEL_PAD;
      return { x0, x1: x0 + (inside || !labels ? w : w + LABEL_GAP + lw) + GAP, lbl: inside ? 'in' : 'out' };
    });

  let spans = build(true);
  let packed = pack(items, spans);
  let compact = false;
  if (packed.count > tl.maxTracks) {
    spans = build(false);
    packed = pack(items, spans);
    compact = true;
  }
  items.forEach((e, i) => band.place.set(e.id, { track: packed.tracks[i], lbl: spans[i].lbl }));
  const lane = band.laneEls[li];
  lane.style.setProperty('--tracks', Math.max(1, packed.count));
  if (compact) lane.dataset.compact = '';
  else delete lane.dataset.compact;
}

function layoutOverview(band, items) {
  const spans = items.map((e) => {
    const x0 = band.x(e.a);
    return { x0, x1: Math.max(band.x(e.hi), x0 + 2) + 1 };
  });
  const { tracks, count } = pack(items, spans);
  items.forEach((e, i) => band.place.set(e.id, { track: tracks[i], lbl: 'out' }));
  band.overviewTracks = Math.max(count, 1);
}
