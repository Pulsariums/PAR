export const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Element with class and text (textContent only: names come from font files and must never be parsed as HTML). */
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

export const button = (label: string, onClick: () => void, cls = 'btn sm'): HTMLButtonElement => {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

export const bytesLabel = (n: number): string => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);
