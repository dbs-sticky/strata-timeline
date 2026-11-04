import '../src/index.js';

const results = window.testResults = [];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const wait = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));
const test = async (name, run) => {
  try { await run(); results.push({ name, passed: true }); }
  catch (e) { results.push({ name, passed: false, error: e.message }); }
  document.querySelector('#results').textContent = JSON.stringify(results, null, 2);
};
const tl = document.querySelector('strata-timeline');
await document.fonts.ready;
const events = Array.from({ length: 10000 }, (_, i) => ({
  id: `e${i}`, title: `Overlapping event ${i}`, start: '2000-01-01', end: '2030-01-01',
  category: i % 2 ? 'a' : 'b',
}));
tl.data = { events, categories: { a: { color: '#ff0000' }, b: { color: '#0000ff' } } };
await wait();

await test('dense fit view bounds detail DOM and overview bitmap', () => {
  assert(tl.driver.nodes.size < 250, `detail nodes: ${tl.driver.nodes.size}`);
  const f = tl.followers[0];
  assert(f.nodes.size === 0 && f.body.querySelectorAll('canvas').length === 1, 'overview must use one raster');
  assert(f.raster.width <= Math.ceil(f.viewport.clientWidth * 3.1 * devicePixelRatio), 'bitmap must be viewport bounded');
  const pixelX = Math.round((f.x(tl.model.events[0].a) - parseFloat(f.raster.style.left) + 5) * devicePixelRatio);
  assert(f.raster.getContext('2d').getImageData(pixelX, 1, 1, 1).data[3] > 0, 'overview must contain visible marks');
});

await test('vertical scroll recycles tracks and retains pinned anchors', async () => {
  const initial = new Set(tl.driver.nodes.keys());
  tl.driver.viewport.scrollTop = 40000;
  await wait();
  assert(tl.driver.nodes.size < 250, 'vertical scroll must stay bounded');
  assert([...tl.driver.nodes.keys()].some((id) => !initial.has(id)), 'must render newly exposed tracks');
  assert(tl.driver.nodes.has(tl.activeId), 'active event must remain mounted');
  tl.select('e9999');
  await wait();
  const node = tl.driver.nodes.get('e9999');
  const r = node.getBoundingClientRect(), vp = tl.driver.viewport.getBoundingClientRect();
  assert(document.activeElement === node && r.top >= vp.top && r.bottom <= vp.bottom, 'keyboard selection must reveal a virtualized event');
  tl.popovers.bubble.hidePopover();
});

await test('zoom and same-scale navigation preserve fit overview', async () => {
  const f = tl.followers[0];
  const axis = f.axisMinor.firstChild, version = f.layoutVersion;
  let paints = 0;
  const observer = new MutationObserver(() => paints++);
  observer.observe(f.raster, { attributes: true });
  await tl.zoomTo({ start: '2010-01', end: '2010-12' });
  await wait();
  await tl.scrollToDate('2015-01-01');
  await wait();
  observer.disconnect();
  assert(f.axisMinor.firstChild === axis && f.layoutVersion === version && paints === 0, 'unchanged overview was repainted or repacked');
  assert(tl.sync.anims.length > 0, 'shades must retain scroll-driven animations');
});

await test('measurement uses the label font and reads it once per layout', () => {
  tl.driver.viewport.scrollTop = 0;
  const original = window.getComputedStyle;
  let reads = 0;
  window.getComputedStyle = (node, ...args) => {
    if (node.classList.contains('st-probe')) reads++;
    return original(node, ...args);
  };
  try { tl.driver.layout(); tl.frame(true); } finally { window.getComputedStyle = original; }
  assert(reads === 1, `font reads: ${reads}`);
  const probe = getComputedStyle(tl.querySelector('.st-probe'));
  const label = getComputedStyle(tl.driver.nodes.get(tl.activeId));
  assert(probe.font === label.font, `font mismatch: ${probe.font} / ${label.font}`);
});

await test('filtering updates raster and keeps selected event access', async () => {
  tl.filter('9999');
  await wait(500);
  assert(tl.eventOrder().length === 1 && tl.driver.nodes.size === 1, 'filter must remove hidden detail events');
  assert(tl.followers[0].place.size === 1, 'overview must repack filtered events');
  tl.filter('');
  await wait(500);
});

await test('navigation interruption settles its public promise', async () => {
  let settled = false;
  tl.scrollToDate('2020-01-01').then(() => { settled = true; });
  tl.nav.cancel();
  await Promise.resolve();
  assert(settled, 'cancelled navigation promise remained pending');
});

await test('raster colors follow theme changes and resize keeps buffers bounded', async () => {
  const f = tl.followers[0];
  tl.data = { events: [{ id: 'color', title: 'Theme color', start: '2000', end: '2030', color: 'light-dark(#ff0000, #0000ff)' }] };
  await wait(500);
  const sample = () => {
    const x = Math.round((f.x(tl.model.events[0].a) - parseFloat(f.raster.style.left) + 5) * devicePixelRatio);
    return [...f.raster.getContext('2d').getImageData(x, 1, 1, 1).data];
  };
  tl.setAttribute('theme', 'light');
  assert(sample()[0] === 255 && sample()[2] === 0, 'light theme color');
  tl.setAttribute('theme', 'dark');
  assert(sample()[0] === 0 && sample()[2] === 255, 'dark theme color');
  tl.style.width = '700px';
  await wait();
  assert(f.raster.width <= Math.ceil(f.viewport.clientWidth * 3.1 * devicePixelRatio), 'resized bitmap must stay bounded');
});

await test('centered and fit followers stay synchronized across hot zones', async () => {
  tl.bands = [{ id: 'detail' }, { id: 'centered', ratio: 0.2, height: 90 }, { id: 'fit', ratio: 'fit', height: 90 }];
  tl.data = {
    events: [{ id: 'long', start: '2000', end: '2030', title: 'Long event' }],
    hotZones: [{ start: '2010', end: '2012', magnify: 10 }],
  };
  await wait(500);
  await tl.zoomTo({ start: '2010', end: '2012' }, { animate: false });
  await wait();
  const d = tl.driver;
  for (const fraction of [0.1, 0.5, 0.9]) {
    d.viewport.scrollLeft = fraction * (d.viewport.scrollWidth - d.viewport.clientWidth);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const f = tl.followers[0];
    const expected = f.viewport.clientWidth / 2 - f.x(d.time(d.viewport.scrollLeft + d.viewport.clientWidth / 2));
    const actual = parseFloat(getComputedStyle(f.canvas).translate);
    assert(Math.abs(actual - expected) < 1, `centered follower offset: ${actual} / ${expected}`);
    assert(f.raster.width <= Math.ceil(f.viewport.clientWidth * 3.1 * devicePixelRatio), 'centered buffer must be viewport bounded');
    const fit = tl.followers[1];
    const edge = fit.x(d.time(d.viewport.scrollLeft + d.pad)) + fit.inset - fit.viewport.clientWidth;
    assert(Math.abs(parseFloat(getComputedStyle(fit.shadeL).translate) - edge) < 1, 'fit shade must match warped driver edge');
  }
});

window.testsDone = true;
