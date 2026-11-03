import { eventWhen } from '../core/model.js';
import { div, el } from './dom.js';

const text = (tag, cls, value) => {
  const n = el(tag, cls);
  n.textContent = value;
  return n;
};

/** Two shared popovers: a hover/focus hint (interestfor) and a click bubble (commandfor), anchored to the event. */
export class Popovers {
  anchorId = null;
  #last = null;
  #anchored = { hint: null, bubble: null };

  constructor(tl) {
    this.tl = tl;
    this.hint = el('div', 'st-hint', { popover: 'hint', id: tl.hintId });
    this.bubble = el('div', 'st-bubble', { popover: 'auto', id: tl.bubbleId, role: 'dialog', 'aria-label': 'Event details' });
    this.els = [this.hint, this.bubble];

    const remember = (e) => {
      const n = e.target.closest?.('.st-ev, .st-link');
      if (n) this.#last = n;
    };
    for (const type of ['pointerover', 'focusin', 'click']) tl.addEventListener(type, remember);

    this.hint.addEventListener('beforetoggle', (e) => {
      if (e.newState === 'open') this.#open('hint', e.source ?? this.#last);
      else this.#anchor('hint', null);
    });
    this.bubble.addEventListener('beforetoggle', (e) => {
      if (e.newState === 'open') this.#open('bubble', e.source ?? this.#last);
      else {
        this.#anchor('bubble', null);
        this.anchorId = null;
      }
    });
    this.bubble.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.bubble.hidePopover();
    });
  }

  openFor(node) {
    this.#last = node;
    this.bubble.showPopover({ source: node });
  }

  #anchor(kind, node) {
    const prev = this.#anchored[kind];
    if (prev && prev !== node) prev.style.removeProperty('anchor-name');
    this.#anchored[kind] = node;
    const name = `--${this.tl.uid}-${kind}`;
    if (node) node.style.setProperty('anchor-name', name);
    this[kind].style.setProperty('position-anchor', node ? name : 'none');
  }

  #open(kind, node) {
    const ev = node && this.tl.model?.byId.get(node.dataset.id);
    if (!ev) return;
    this.#anchor(kind, node);
    if (kind === 'hint') return this.#fillHint(ev);
    this.anchorId = ev.id;
    this.tl.setActive(ev.id);
    this.bubble.replaceChildren();
    if (this.tl.bubbleRenderer) this.tl.bubbleRenderer(ev, this.bubble, this.tl);
    else this.#fillBubble(ev);
    this.tl.emit('strata-select', { event: ev });
  }

  #meta(ev) {
    const { model } = this.tl;
    const cat = ev.category ? (model.categories.get(ev.category)?.label ?? ev.category) : '';
    return [cat, model.singleLane ? '' : model.lanes[ev.laneIndex].label].filter(Boolean).join(' · ');
  }

  #fillHint(ev) {
    const meta = this.#meta(ev);
    this.hint.replaceChildren(
      text('strong', 'st-hint-title', ev.title),
      text('span', 'st-hint-when', eventWhen(ev, this.tl.locale)),
      ...(meta ? [text('span', 'st-hint-meta', meta)] : []),
      ...(ev.description ? [text('span', 'st-hint-desc', ev.description)] : []),
    );
  }

  #fillBubble(ev) {
    const head = div('st-bubble-head');
    const dot = el('i', 'st-bubble-dot');
    if (ev.color) dot.style.setProperty('--c', ev.color);
    const close = el('button', 'st-bubble-close', { type: 'button', 'data-close': '', 'aria-label': 'Close' });
    close.textContent = '×';
    head.append(dot, text('h3', 'st-bubble-title', ev.title), close);
    const body = div('st-bubble-body');
    body.append(text('p', 'st-bubble-when', eventWhen(ev, this.tl.locale)));
    const meta = this.#meta(ev);
    if (meta) body.append(text('p', 'st-bubble-meta', meta));
    if (ev.confidence) body.append(text('p', 'st-bubble-meta', `Confidence: ${ev.confidence}`));
    if (ev.image) body.append(el('img', 'st-bubble-img', { src: ev.image, alt: '', loading: 'lazy' }));
    if (ev.description) body.append(text('p', 'st-bubble-desc', ev.description));
    const rows = Object.entries(ev.data);
    if (rows.length) {
      const dl = el('dl', 'st-bubble-data');
      for (const [k, v] of rows) dl.append(text('dt', '', k), text('dd', '', String(v)));
      body.append(dl);
    }
    for (const l of ev.links) {
      const a = el('a', 'st-bubble-link', { href: l.href, target: '_blank', rel: 'noopener noreferrer' });
      a.textContent = l.label;
      body.append(a);
    }
    this.bubble.append(head, body);
  }
}
