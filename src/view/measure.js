/** Cached text widths using a canvas context that mirrors the label font. */
export function createMeasurer(getFont, cap = 240) {
  const ctx = document.createElement('canvas').getContext('2d');
  let font = '';
  const cache = new Map();
  const measure = (text) => {
    let w = cache.get(text);
    if (w === undefined) cache.set(text, (w = Math.min(Math.ceil(ctx.measureText(text).width) + 2, cap)));
    return w;
  };
  measure.refresh = () => {
    const now = getFont();
    if (now !== font) {
      font = now;
      ctx.font = font;
      cache.clear();
    }
  };
  measure.clear = () => cache.clear();
  return measure;
}
