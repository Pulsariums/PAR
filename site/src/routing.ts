import { requestView, viewFromHash } from './view';

/** Deep links: `#lab` / `#lab-root` open the Studio section in the lab view, `#studio` in whatever view it is in. */
const LEGACY = /^#(lab|lab-root|studio)$/;
const TARGET = 'studio-root';

const redirect = (): void => {
  if (!LEGACY.test(location.hash)) return;
  const v = viewFromHash(location.hash);
  if (v) requestView(v);
  history.replaceState(null, '', `#${TARGET}`);
  document.getElementById(TARGET)?.scrollIntoView();
};

/** Keeps the sticky header's height in `--top-h` so anchored sections never start underneath it. */
const trackHeader = (): void => {
  const top = document.querySelector<HTMLElement>('.top');
  if (!top) return;
  const set = (): void => document.documentElement.style.setProperty('--top-h', `${top.offsetHeight}px`);
  set();
  if (typeof ResizeObserver === 'function') new ResizeObserver(set).observe(top);
};

export const initRouting = (): void => {
  trackHeader();
  window.addEventListener('hashchange', redirect);
  window.addEventListener('load', redirect);
  redirect();
};
