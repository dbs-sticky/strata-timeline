export const el = (tag, className, attrs) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

export const div = (className, attrs) => el('div', className, attrs);

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Set several CSS custom properties at once. Values are numbers or strings. */
export function setVars(node, vars) {
  for (const key in vars) node.style.setProperty(key, vars[key]);
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
