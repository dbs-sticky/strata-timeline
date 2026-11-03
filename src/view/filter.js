/** Filter and highlight state. Highlight terms match event text or category id; each term gets a colour slot. */
export class Filter {
  constructor() {
    this.text = '';
    this.hiddenCategories = new Set();
    this.terms = [];
    this.highlightOnly = false;
  }

  get active() {
    return Boolean(this.text) || this.hiddenCategories.size > 0;
  }

  #matchesText(ev) {
    return !this.text || ev.text.includes(this.text);
  }

  isVisible(ev) {
    if (ev.category && this.hiddenCategories.has(ev.category)) return false;
    return this.highlightOnly ? true : this.#matchesText(ev);
  }

  /** Index of the first highlight term the event matches, or -1. */
  highlightIndex(ev) {
    if (this.highlightOnly && this.text && this.#matchesText(ev)) return 0;
    const i = this.terms.findIndex((t) => ev.category === t || ev.text.includes(t));
    return i < 0 ? -1 : i + (this.highlightOnly && this.text ? 1 : 0);
  }
}
