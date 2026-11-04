/** Rasterize marks into a viewport-sized buffer; bitmap memory never follows domain width. */
export function paintOverview(band, found, x0, x1) {
  const { tl, raster, colorProbe } = band;
  const width = Math.max(1, Math.ceil(x1 - x0));
  const height = Math.max(1, band.body.clientHeight);
  const dpr = devicePixelRatio;
  raster.width = Math.ceil(width * dpr);
  raster.height = Math.ceil(height * dpr);
  raster.style.left = `${x0}px`;
  raster.style.width = `${width}px`;
  raster.style.height = `${height}px`;
  const ctx = raster.getContext('2d');
  ctx.scale(dpr, dpr);
  const row = Math.min(7, height / band.overviewTracks);
  const visible = found.filter((e) => tl.isVisibleEvent(e));
  const colorFor = (e) => {
    const hl = tl.highlightIndex(e);
    return hl >= 0 && hl < 4 ? `var(--st-hl-${hl})` : e.color || 'var(--st-accent)';
  };
  // Resolve CSS colors (including light-dark/oklch/variables) once per distinct color.
  const colors = new Map(visible.map((e) => [colorFor(e), null]));
  for (const color of colors.keys()) {
    colorProbe.style.setProperty('--c', color);
    colors.set(color, getComputedStyle(colorProbe).backgroundColor);
  }
  for (const e of visible) {
    ctx.fillStyle = colors.get(colorFor(e));
    ctx.globalAlpha = tl.hasAttribute('data-hl-active') && tl.highlightIndex(e) < 0 ? 0.32 : 1;
    const x = band.x(e.kind === 'span' ? e.a : e.at) - x0;
    const end = e.kind === 'span' ? band.x(e.d) - x0 : x + 3;
    const left = Math.max(0, x);
    const right = Math.min(width, Math.max(end, x + 3));
    if (right > left) ctx.fillRect(left, band.place.get(e.id).track * row, right - left, Math.max(1, row - 1));
  }
}
