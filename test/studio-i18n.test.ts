import { describe, expect, it } from 'vitest';

import { en } from '../site/src/i18n/en';
import { ru } from '../site/src/i18n/ru';
import { tr } from '../site/src/i18n/tr';
import { STUDIO_HTML } from '../site/src/studio/markup';

type Glob = (patterns: string[], opts: { query: string; import: string; eager: true }) => Record<string, string>;
/** Every site source (not the dictionaries) and the page, as text. */
const sources = Object.values((import.meta as unknown as { glob: Glob }).glob(['../site/src/**/*.ts', '!../site/src/i18n/**', '../site/index.html'], { query: '?raw', import: 'default', eager: true })).join('\n') + STUDIO_HTML;
/** Keys built at run time (`t(\`st.mode.${...}\`)`): they cannot be found as literals. */
const DYNAMIC = /^st\.(l\.src|mode)\./;

describe('Studio texts', () => {
  const keys = Object.keys(en).filter((k) => k.startsWith('st.') || k === 'nav.studio');

  it('every data-i18n key of the Studio markup exists in all three languages', () => {
    const used = [...STUDIO_HTML.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]!);
    const attrs = [...STUDIO_HTML.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1]!.split(',').map((p) => p.split(':')[1]!));
    expect(used.length).toBeGreaterThan(30);
    for (const k of [...used, ...attrs]) for (const d of [en, tr, ru]) expect(Object.keys(d), k).toContain(k);
  });

  it('en, tr and ru have the same keys and the same {placeholders}', () => {
    const holes = (s: string): string => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(tr[k], k).toBeDefined();
      expect(ru[k], k).toBeDefined();
      expect(holes(tr[k]), `${k} (tr)`).toBe(holes(en[k]));
      expect(holes(ru[k]), `${k} (ru)`).toBe(holes(en[k]));
    }
  });

  it('has no dead keys and no leftover Lab texts', () => {
    expect(Object.keys(en).filter((k) => k.startsWith('lab.') || k === 'nav.lab')).toEqual([]);
    const used = (k: string): boolean => new RegExp(`['":]${k.replace(/\./g, '\\.')}['",]`).test(sources);
    expect(keys.filter((k) => !DYNAMIC.test(k) && !used(k))).toEqual([]);
  });
});
