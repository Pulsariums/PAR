const KEY = 'par.theme';
const root = document.documentElement;
// jsdom (tests) has no matchMedia: the system preference is only consulted when it exists.
const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

/** Effective theme: explicit data-theme, else the system preference. */
export const isDark = (): boolean => (root.dataset.theme ? root.dataset.theme === 'dark' : mq?.matches ?? false);

export const initTheme = (): void => {
  const btn = document.getElementById('themeBtn') as HTMLButtonElement | null;
  if (!btn) return;
  const sync = () => btn.setAttribute('aria-pressed', String(isDark()));
  btn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
    sync();
  });
  mq?.addEventListener('change', sync);
  sync();
};
