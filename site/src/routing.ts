/** Old deep links keep working: the Lab was merged into the Studio, so `#lab` and `#lab-root` (and the short `#studio`) land on the Studio section. */
const LEGACY = /^#(lab|lab-root|studio)$/;
const TARGET = 'studio-root';

const redirect = (): void => {
  if (!LEGACY.test(location.hash)) return;
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
