# Strata timeline

A modern, dependency-free successor to the [SIMILE Timeline](https://simile.mit.edu/timeline/) widget, as a single custom element: `<strata-timeline>`.

It keeps the ideas that made SIMILE good (linked bands at different scales, an overview with a window, instant and duration events, imprecise dates, hot zones, decorators, click bubbles) and drops the 2000s DHTML. There is no framework, no build step and no runtime dependency.

**Browser support: current Chrome and Edge only.** It uses shipped platform features directly, with no polyfills or fallbacks: `ScrollTimeline`, the Popover API with `interestfor` and `commandfor`, CSS anchor positioning, element-scoped view transitions, `scroll-state()` container queries, `contrast-color()` and `light-dark()`.

## Run the demos

```bash
npm run dev
```

Then open http://localhost:5173/ . Tests for the pure modules: `npm test`.

## Use it

```html
<link rel="stylesheet" href="src/strata.css">
<strata-timeline src="events.json" style="height: 70vh"></strata-timeline>
<script type="module" src="src/index.js"></script>
```

```js
const tl = document.querySelector('strata-timeline');
tl.data = nativeJson;                                   // or
await tl.load(url, { adapter: (api) => toNative(api), init: { credentials: 'include' } });

tl.scrollToDate('2019-07-27');
tl.zoomTo({ start: '2024-02', end: '2024-03' });
tl.fit();
tl.filter('c-check');                                   // text filter
tl.highlight(['lease', 'storage']);                     // one colour slot per term
tl.addEventListener('strata-select', (e) => e.detail.event);
```

Attributes: `src`, `theme` (`light`, `dark`, default follows the system), `locale` (month and weekday names), `wheel` (`scroll` default, `zoom`, `default`), `nocontrols`. Events: `strata-select`, `strata-rangechange`, `strata-zoom`, `strata-filter`. Set `tl.bubbleRenderer = (event, container, tl) => {...}` to draw your own detail bubble.

### Bands

The first band is the detail band (a real scroll container). Others follow it:

```js
tl.bands = [
  { id: 'detail' },
  { id: 'months', ratio: 1 / 10, height: 74 },      // follows the centre, 10x coarser
  { id: 'overview', ratio: 'fit', height: 64 },     // whole span with a moving window (default)
];
```

Follower bands move through `ScrollTimeline` animations, so they stay locked to the detail band on the compositor, with no scroll handler. Add `hotZones: true` to a follower to warp its time axis too.

## Data format

```jsonc
{
  "title": "N0001X A320",
  "lanes": [{ "id": "ops", "label": "Operator" }],                    // optional
  "categories": { "check": { "label": "Check", "color": "#c2570c" } },  // legend and colours
  "events": [{
    "id": "e1", "title": "C-check",
    "start": "2024-02-05",                  // "2019", "2019-07", "2019-07-27", "2019-07-27T10:30Z", "-0490", "today"
    "end": { "earliest": "2024-02-20", "latest": "2024-03-01" },   // omit for an instant; any date may be a range
    "ongoing": true,                        // no end and still running: fades out at "now"
    "lane": "ops", "category": "check",
    "description": "...", "image": "...", "links": [{ "href": "...", "label": "..." }],
    "color": "...", "className": "...", "confidence": "low",       // low draws a dashed, faded tape
    "data": { "Location": "CWL" }           // key/value rows in the bubble
  }],
  "decorators": [
    { "type": "span", "start": "2020-04", "end": "2021-06", "label": "Stored" },
    { "type": "point", "date": "today", "label": "Today" }
  ],
  "hotZones": [{ "start": "2024-02-05", "end": "2024-02-26", "magnify": 12, "label": "C-check" }]
}
```

- **Dates** are UTC. Year and month strings cover their whole period, so `"2014-03"` is drawn as a faded ramp across March. Day and finer are exact instants. A day-precision end is the start of that day.
- **Hot zones** stretch (`magnify` above 1) or compress (below 1) time inside a range, and nest by multiplying. Tick labels get finer in magnified zones.
- Links and images are filtered to http(s), mailto, relative and data-image URLs. All text is inserted with `textContent`.

## Adapters

An adapter is a plain function from your API response to the native JSON. `src/adapters/aircraft.js` is a worked example: it maps per-airframe history (order, delivery, leases, registrations, operators, storage, maintenance, occurrences) to five lanes and puts short checks in hot zones. Copy it and change the mapping to match your API.

## Interaction

- Drag to pan (mouse, with momentum). Touch uses native scrolling.
- Ctrl/Cmd + wheel or trackpad pinch zooms around the pointer. Plain wheel pans. Double-click centres a date.
- Click, drag or wheel on an overview band to move the detail band.
- Keyboard: the active event is the single tab stop. Left/Right walk events in time order, Up/Down move between tracks and lanes, Home/End jump to the ends, +/- zoom, Enter opens the bubble, Escape closes it.
- A hover or focus hint (`interestfor`) and a click bubble (`commandfor`) are shared popovers anchored to the event.
- A List view (toolbar) gives a chronological table for screen readers and print.

## How it works

- `src/core/*` is pure JS (no DOM): dates, hot-zone warp, tick scale, interval index, track packing, model.
- Only events near the viewport exist as DOM nodes (binary-searched interval index, one viewport of buffer each side).
- Zooming writes one CSS custom property per band. Positions are `calc(var(--s) * var(--ppd) * 1px)`.
- Continuous pan and zoom never use view transitions. Discrete changes (data swap, filter, list view) run in an element-scoped one.
