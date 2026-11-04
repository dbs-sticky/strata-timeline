import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Navigator } from '../src/view/navigator.js';

test('navigation settles on cancellation, replacement and completion', async (t) => {
  const callbacks = new Map();
  let next = 0;
  const originals = ['matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame'].map((key) => [key, globalThis[key]]);
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = (fn) => { callbacks.set(++next, fn); return next; };
  globalThis.cancelAnimationFrame = (id) => callbacks.delete(id);
  t.after(() => { for (const [key, value] of originals) value === undefined ? delete globalThis[key] : globalThis[key] = value; });
  const tl = {
    labelWidth: 0,
    driver: { viewport: { clientWidth: 100, scrollLeft: 0 }, warp: { W: (x) => x, inv: (x) => x }, x: (x) => x, time: (x) => x },
    setScales() {}, scaleChanged() {},
  };
  const nav = new Navigator(tl);
  const flush = (time) => {
    const batch = [...callbacks.values()];
    callbacks.clear();
    for (const callback of batch) callback(time);
  };
  const checkSettled = async (promise) => {
    let settled = false;
    promise.then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, true, 'interrupted promise must settle');
  };
  const before = nav.moveTo(2, 100);
  nav.cancel();
  await checkSettled(before);
  assert.equal(callbacks.size, 0);
  const during = nav.moveTo(2, 100);
  flush(performance.now() + 20);
  const replacement = nav.moveTo(3, 200);
  await checkSettled(during);
  flush(performance.now() + 400);
  await checkSettled(replacement);
  assert.equal(nav.raf, 0);
  assert.equal(callbacks.size, 0);

  // Cancellation can also occur inside a synchronous zoom event listener.
  tl.scaleChanged = () => nav.cancel();
  const reentrant = nav.moveTo(4, 300);
  flush(performance.now() + 20);
  await checkSettled(reentrant);
  assert.equal(callbacks.size, 0);
});
