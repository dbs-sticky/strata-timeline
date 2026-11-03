/**
 * Dragging, clicking or wheeling on a follower band moves the driver. In a centered follower the content follows
 * the pointer; in a static (whole-domain) follower the visible window is placed under the pointer.
 */
export function attachFollowerInput(tl, f) {
  const node = f.viewport;
  const driver = () => tl.driver;
  const localX = (e) => e.clientX - node.getBoundingClientRect().left;
  const windowStart = () => tl.sync.window(f, driver().viewport.scrollLeft)[0];
  const centerOn = (t) => (driver().viewport.scrollLeft = tl.sync.scrollForTime(t));

  let grab = null;
  const follow = (e) => {
    const x = localX(e);
    if (f.cfg.mode === 'static') return centerOn(f.time(x - f.inset));
    // keep the grabbed time under the pointer
    const V2 = node.clientWidth;
    const w = f.warp.W(grab.t) - (x - V2 / 2) / f.ppd;
    centerOn(f.warp.inv(w));
  };

  node.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    tl.nav.cancel();
    grab = { id: e.pointerId, t: f.time(windowStart() + localX(e)) };
    node.setPointerCapture(e.pointerId);
    node.dataset.dragging = '';
    follow(e);
  });
  node.addEventListener('pointermove', (e) => {
    if (grab && e.pointerId === grab.id) follow(e);
  });
  const end = (e) => {
    if (grab && e.pointerId === grab.id) {
      grab = null;
      delete node.dataset.dragging;
    }
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);

  node.addEventListener('wheel', (e) => {
    e.preventDefault();
    const d = driver();
    const c = tl.nav.centerTime;
    const delta = (e.deltaX || e.deltaY) * (e.deltaMode === 1 ? 33 : 1);
    d.viewport.scrollLeft = tl.sync.scrollForTime(f.time(f.x(c) + delta));
  }, { passive: false });
}
