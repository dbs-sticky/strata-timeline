import { eventWhen } from '../core/model.js';
import { div, el } from './dom.js';

const button = (act, label, aria) => {
  const b = el('button', 'st-btn', { type: 'button', 'data-act': act });
  b.textContent = label;
  if (aria) b.setAttribute('aria-label', aria);
  return b;
};

/** Toolbar (zoom, filter, legend, view switch) and the accessible list view. */
export class Controls {
  #timer = 0;

  constructor(tl) {
    this.tl = tl;
    this.el = el('div', 'st-toolbar', { role: 'toolbar', 'aria-label': 'Timeline controls' });
    const zoom = div('st-group');
    zoom.append(button('out', '−', 'Zoom out'), button('in', '+', 'Zoom in'), button('fit', 'Fit'), button('today', 'Today'));

    const search = el('search', 'st-search');
    this.input = el('input', 'st-input', { type: 'search', placeholder: 'Filter events', 'aria-label': 'Filter events', autocomplete: 'off' });
    const sw = el('label', 'st-switch');
    this.highlightOnly = el('input', '', { type: 'checkbox', role: 'switch' });
    sw.append(this.highlightOnly, document.createTextNode('Highlight only'));
    search.append(this.input, sw);

    this.legend = div('st-legend', { role: 'group', 'aria-label': 'Categories' });
    this.count = el('output', 'st-count');
    this.viewButton = button('view', 'List');
    this.viewButton.setAttribute('aria-pressed', 'false');
    this.el.append(zoom, search, this.legend, this.count, this.viewButton);

    this.el.addEventListener('click', (e) => this.#click(e));
    this.input.addEventListener('input', () => {
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => tl.filter(this.input.value), 160);
    });
    this.highlightOnly.addEventListener('change', () => tl.setHighlightOnly(this.highlightOnly.checked));
    if (tl.hasAttribute('nocontrols')) this.el.hidden = true;
  }

  #click(e) {
    const { tl } = this;
    const chip = e.target.closest('[data-cat]');
    if (chip) {
      const hide = chip.getAttribute('aria-pressed') === 'true';
      chip.setAttribute('aria-pressed', String(!hide));
      return tl.setCategoryHidden(chip.dataset.cat, hide);
    }
    switch (e.target.closest('[data-act]')?.dataset.act) {
      case 'in': return tl.zoomBy(1.6);
      case 'out': return tl.zoomBy(1 / 1.6);
      case 'fit': return tl.fit();
      case 'today': return tl.scrollToDate('today');
      case 'view': return this.toggleView();
    }
  }

  update(model) {
    this.tl.filterState.hiddenCategories.clear();
    const chips = [];
    for (const c of model.categories.values()) {
      const chip = el('button', 'st-chip', { type: 'button', 'data-cat': c.id, 'aria-pressed': 'true' });
      const swatch = el('i', 'st-swatch');
      swatch.style.setProperty('--c', c.color);
      chip.append(swatch, document.createTextNode(c.label));
      chips.push(chip);
    }
    this.legend.replaceChildren(...chips);
    this.legend.hidden = chips.length === 0;
    this.refresh();
  }

  refresh() {
    const { tl } = this;
    if (!tl.model) return;
    this.count.textContent = `${tl.eventOrder().length} of ${tl.model.events.length} events`;
    if (!tl.listEl.hidden) this.#buildList();
  }

  toggleView() {
    const { tl } = this;
    const showList = tl.listEl.hidden;
    tl.transition(() => {
      tl.bandsEl.hidden = showList;
      tl.listEl.hidden = !showList;
      if (showList) this.#buildList();
      this.viewButton.setAttribute('aria-pressed', String(showList));
      this.viewButton.textContent = showList ? 'Timeline' : 'List';
    });
  }

  #buildList() {
    const { tl } = this;
    const table = el('table', 'st-table');
    table.append(el('caption', 'st-sr-only'));
    table.caption.textContent = tl.model.title || 'Events in time order';
    const head = el('tr');
    for (const h of ['Event', 'When', 'Lane', 'Category']) {
      const th = el('th', '', { scope: 'col' });
      th.textContent = h;
      head.append(th);
    }
    table.createTHead().append(head);
    const body = table.createTBody();
    for (const ev of tl.eventOrder()) {
      const row = el('tr');
      const th = el('th', '', { scope: 'row' });
      const open = el('button', 'st-link', { type: 'button', commandfor: tl.bubbleId, command: 'show-popover' });
      open.dataset.id = ev.id;
      open.textContent = ev.title;
      th.append(open);
      const cells = [eventWhen(ev, tl.locale), tl.model.lanes[ev.laneIndex].label, tl.model.categories.get(ev.category)?.label ?? ''];
      row.append(th, ...cells.map((c) => Object.assign(el('td'), { textContent: c })));
      body.append(row);
    }
    tl.listEl.replaceChildren(table);
  }
}
