const KEY = 'par.theme';
const root = document.documentElement;
const mq = window.matchMedia('(prefers-color-scheme: dark)');

/** Effective theme: explicit data-theme, else the system preference. */
export const isDark = (): boolean => (root.dataset.theme ? root.dataset.theme === 'dark' : mq.matches);

export const initTheme = (): void => {
  const btn = document.getElementById('themeBtn') as HTMLButtonElement;
  const sync = () => btn.setAttribute('aria-pressed', String(isDark()));
  btn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
    sync();
  });
  mq.addEventListener('change', sync);
  sync();
};
