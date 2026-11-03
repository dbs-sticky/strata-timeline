import { attachFollowerInput } from './follower-input.js';
import { clamp, prefersReducedMotion } from './dom.js';

/** Pointer, wheel and double-click handling for the driver band, plus input for follower bands. */
export function attachInteractions(tl) {
  const vp = tl.driver.viewport;
  vp.addEventListener('scroll', () => tl.queueFrame(), { passive: true });

  let momentum = 0;
  const stopMomentum = () => {
    cancelAnimationFrame(momentum);
    momentum = 0;
  };

  // Drag to pan (mouse only: touch and pen use native scrolling).
  let drag = null;
  let lastDragEnd = 0;
  vp.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    tl.nav.cancel();
    stopMomentum();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop, moved: false, samples: [] };
  });
  vp.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      vp.setPointerCapture(e.pointerId); // only now, so plain clicks still reach the event buttons
      vp.dataset.dragging = '';
    }
    vp.scrollLeft = drag.sl - dx;
    vp.scrollTop = drag.st - dy;
    drag.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    if (drag.samples.length > 6) drag.samples.shift();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, samples } = drag;
    drag = null;
    delete vp.dataset.dragging;
    if (!moved) return;
    lastDragEnd = performance.now();
    const a = samples[0];
    const b = samples[samples.length - 1];
    if (!a || !b || b.t === a.t || e.timeStamp - b.t > 80 || prefersReducedMotion()) return;
    const dt = Math.max(b.t - a.t, 16);
    fling(-(b.x - a.x) / dt, -(b.y - a.y) / dt);
  };
  vp.addEventListener('pointerup', endDrag);
  vp.addEventListener('pointercancel', endDrag);
  vp.addEventListener('click', (e) => {
    if (performance.now() - lastDragEnd < 60) e.stopImmediatePropagation();
  }, true);

  function fling(vx, vy) {
    vx = clamp(vx, -4, 4);
    vy = clamp(vy, -4, 4);
    if (Math.hypot(vx, vy) < 0.15) return;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(now - last, 40);
      last = now;
      const decay = Math.exp(-dt / 325);
      vx *= decay;
      vy *= decay;
      vp.scrollLeft += vx * dt;
      vp.scrollTop += vy * dt;
      momentum = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : 0;
    };
    momentum = requestAnimationFrame(step);
  }

  // Wheel: zoom with ctrl/cmd (also trackpad pinch), pan otherwise. wheel="zoom" swaps them; "default" leaves it native.
  let zoomFactor = 1;
  let zoomX = 0;
  let zoomQueued = false;
  const queueZoom = (factor, x) => {
    zoomFactor *= factor;
    zoomX = x;
    if (zoomQueued) return;
    zoomQueued = true;
    requestAnimationFrame(() => {
      zoomQueued = false;
      const f = zoomFactor;
      zoomFactor = 1;
      tl.nav.zoomBy(f, zoomX);
    });
  };
  vp.addEventListener('wheel', (e) => {
    const mode = tl.getAttribute('wheel') || 'scroll';
    if (mode === 'default' && !e.ctrlKey) return;
    tl.nav.cancel();
    stopMomentum();
    const zoom = e.ctrlKey || e.metaKey || (mode === 'zoom' && !e.shiftKey);
    if (zoom) {
      e.preventDefault();
      const dy = clamp(e.deltaY * (e.deltaMode === 1 ? 33 : 1), -120, 120);
      const rate = e.ctrlKey && Math.abs(e.deltaY) < 30 ? 0.012 : 0.0022;
      queueZoom(Math.exp(-dy * rate), e.clientX - vp.getBoundingClientRect().left);
    } else if (e.shiftKey || (Math.abs(e.deltaY) > Math.abs(e.deltaX) && vp.scrollHeight <= vp.clientHeight + 1)) {
      e.preventDefault();
      vp.scrollLeft += (e.deltaX || e.deltaY) * (e.deltaMode === 1 ? 33 : 1);
    }
  }, { passive: false });

  // Double-click centres the clicked date.
  vp.addEventListener('dblclick', (e) => {
    if (e.target.closest('.st-ev, .st-lane-label')) return;
    const t = tl.driver.time(vp.scrollLeft + e.clientX - vp.getBoundingClientRect().left);
    tl.nav.moveTo(tl.nav.ppd, t);
  });

  for (const f of tl.followers) attachFollowerInput(tl, f);
}
