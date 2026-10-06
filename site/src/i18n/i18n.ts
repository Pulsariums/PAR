import { en, type Dict } from './en';
import { ru } from './ru';
import { tr } from './tr';

export type Lang = 'en' | 'tr' | 'ru';
const DICTS: Record<Lang, Dict> = { en, tr, ru };
const KEY = 'par.lang';
let lang: Lang = 'en';
const listeners = new Set<(l: Lang) => void>();

const isLang = (v: unknown): v is Lang => v === 'en' || v === 'tr' || v === 'ru';

const detect = (): Lang => {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch { /* storage unavailable */ }
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return isLang(nav) ? nav : 'en';
};

export const getLang = (): Lang => lang;
export const onLang = (fn: (l: Lang) => void): void => { listeners.add(fn); };

/** Translates a key; `{name}` placeholders are replaced from `vars`. */
export const t = (key: keyof Dict, vars: Record<string, string | number> = {}): string =>
  DICTS[lang][key].replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ''));

/** Applies the dictionary to every [data-i18n] / [data-i18n-attr] element under `root`. */
export const applyI18n = (root: ParentNode = document): void => {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as keyof Dict);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    for (const pair of (el.dataset.i18nAttr ?? '').split(',')) {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr, t(key as keyof Dict));
    }
  });
};

export const setLang = (next: Lang): void => {
  lang = next;
  document.documentElement.lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === next)));
  applyI18n();
  listeners.forEach((fn) => fn(next));
};

export const initI18n = (): void => {
  document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang as Lang)));
  setLang(detect());
};
