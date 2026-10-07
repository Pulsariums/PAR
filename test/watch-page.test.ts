/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

import { en } from '../site/src/i18n/en';
import { tr } from '../site/src/i18n/tr';
import { ru } from '../site/src/i18n/ru';
import { WATCH_HTML } from '../site/src/watch/markup';

const raw = import.meta.glob<string>('../site/src/watch/*.ts', { query: '?raw', import: 'default', eager: true });
const sources = Object.entries(raw).filter(([f]) => !f.endsWith('/markup.ts')).map(([, s]) => s);

describe('player page', () => {
  it('every element id the code looks up exists in the markup', () => {
    const used = new Set<string>();
    for (const s of sources) for (const m of s.matchAll(/\$(?:<[^>]+>)?\('(w[A-Z]\w*)'\)|'(w[A-Z]\w*)'/g)) used.add(m[1] ?? m[2]!);
    const missing = [...used].filter((id) => !WATCH_HTML.includes(`id="${id}"`));
    expect(missing).toEqual([]);
  });
  it('every translation key of the page exists in all three languages', () => {
    const keys = new Set<string>();
    for (const s of [WATCH_HTML, ...sources]) for (const m of s.matchAll(/'(w\.\w+)'|"(w\.\w+)"|:(w\.\w+)/g)) keys.add(m[1] ?? m[2] ?? m[3]!);
    for (const d of [en, tr, ru]) expect([...keys].filter((k) => !(k in d))).toEqual([]);
  });
});
