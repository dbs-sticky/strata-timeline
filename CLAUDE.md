# Strata timeline

A framework-free successor to the SIMILE Timeline widget. The custom element is `<strata-timeline>`.

**Browser support:** current Chrome and Edge only. Use shipped platform features directly (ScrollTimeline, `interestfor`, `commandfor`, anchor positioning, scoped view transitions, `scroll-state()` queries, `contrast-color()`), with no polyfills and no fallbacks.

## Layout
- `src/core/*` is pure JS with no DOM access, so it runs under `node --test`. Dates are UTC days since 1970-01-01, as floats.
- `src/view/*` is DOM code. `src/strata.css` holds all styles in `@layer strata`.
- `src/adapters/*` turns outside data into the native JSON model.
- `demos/*` are static pages served by `npm run dev` (port 5173).

## Rules
- No runtime dependencies and no build step.
- Build DOM with `textContent` and attributes, never `innerHTML` with data values.
- Panning is native scrolling on the driver band. Followers move through `ScrollTimeline` animations, so do not move them from scroll handlers.
- Continuous pan and zoom never use view transitions. They are only for discrete changes (data swap, filter, view mode).

## Knowledge system

Used by the `project-closeout` skill. This repo holds the *mechanics*; the wiki holds the durable *why*; the journal holds what happened on a given day. Where they disagree, the code wins.

| | |
|---|---|
| Wiki | `C:\Users\dbsst\Notes\wiki\timeline\` |
| Hub note | `timeline.md` |
| Logseq tag | `#timeline` (with `#Dev`) |
| Journal | `C:\Users\dbsst\Notes\journals\YYYY_MM_DD.md` |

The wiki has `00-Overview/`, `04-Decisions/` and `05-Dev-Log/`. Wiki notes are never hard-wrapped; see `C:\Users\dbsst\Notes\wiki\CLAUDE.md`.
