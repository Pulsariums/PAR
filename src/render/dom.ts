import type { Css } from './textCss';

export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Writes inline styles to one element and remembers what it wrote, so repeated per-frame
 * updates only touch properties whose value actually changed.
 */
export class CssWriter {
  private last = new Map<string, string>();

  constructor(readonly el: HTMLElement | SVGElement) {}

  set(css: Css): void {
    for (const key in css) this.prop(key, css[key]);
  }

  prop(key: string, value: string): void {
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    this.el.style.setProperty(key, value);
  }

  attr(name: string, value: string): void {
    const key = `@${name}`;
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    this.el.setAttribute(name, value);
  }
}

export const div = (className: string, css: Css): HTMLDivElement => {
  const el = document.createElement('div');
  el.className = className;
  for (const k in css) el.style.setProperty(k, css[k]);
  return el;
};

export const span = (className: string): HTMLSpanElement => {
  const el = document.createElement('span');
  el.className = className;
  return el;
};
