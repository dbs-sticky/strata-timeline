/**
 * Keyboard model: one tab stop (the active event). Left/Right walk events in time order (so they cross
 * virtualised, not-yet-rendered regions), Up/Down move spatially between tracks and lanes, Home/End jump to the
 * ends, +/- zoom. Arrow keys fall through to native scrolling when there is nowhere to go.
 */
export function attachKeyboard(tl) {
  tl.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.composedPath()[0];
    if (!(target instanceof Element) || !tl.driver.viewport.contains(target)) return;

    switch (e.key) {
      case 'ArrowRight': return step(e, 1);
      case 'ArrowLeft': return step(e, -1);
      case 'Home': return go(e, tl.eventOrder().at(0));
      case 'End': return go(e, tl.eventOrder().at(-1));
      case 'ArrowDown': return spatial(e, target, 'down');
      case 'ArrowUp': return spatial(e, target, 'up');
      case '+':
      case '=':
        e.preventDefault();
        return tl.zoomBy(1.4);
      case '-':
      case '_':
        e.preventDefault();
        return tl.zoomBy(1 / 1.4);
    }
  });

  function go(e, ev) {
    if (!ev) return;
    e.preventDefault();
    tl.setActive(ev.id, { focus: true, scroll: true });
  }

  function step(e, delta) {
    const order = tl.eventOrder();
    const i = order.findIndex((x) => x.id === tl.activeId);
    go(e, order[i < 0 ? 0 : i + delta]);
  }

  function spatial(e, target, dir) {
    const current = target.closest('.st-ev');
    if (!current) return;
    const cur = current.getBoundingClientRect();
    let best = null;
    let bestRank = 2;
    let bestScore = Infinity;
    for (const node of tl.driver.nodes.values()) {
      if (node === current || !node.checkVisibility()) continue;
      const r = node.getBoundingClientRect();
      const ahead = dir === 'down' ? r.top >= cur.bottom - 2 : r.bottom <= cur.top + 2;
      if (!ahead) continue;
      const gap = dir === 'down' ? r.top - cur.bottom : cur.top - r.bottom;
      const offset = Math.abs((r.left + r.right) / 2 - (cur.left + cur.right) / 2);
      const aligned = r.left < cur.right && r.right > cur.left;
      const rank = aligned ? 0 : 1;
      const score = aligned ? gap + offset * 0.001 : gap + 2 * offset;
      if (rank < bestRank || (rank === bestRank && score < bestScore)) [best, bestRank, bestScore] = [node, rank, score];
    }
    if (best) go(e, tl.model.byId.get(best.dataset.id));
  }
}
