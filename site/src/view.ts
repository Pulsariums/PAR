/** The Studio's two views: "watch" (the player alone, nothing measured) and "lab" (shelves, metrics, export, reference). */
export type View = 'watch' | 'lab';

const KEY = 'par.view';

/** `#lab` and `#lab-root` (old deep links and the nav's Lab entry) ask for the lab view; every other hash says nothing. */
export const viewFromHash = (hash: string): View | null => (/^#(lab|lab-root)$/.test(hash) ? 'lab' : null);

export const isView = (v: unknown): v is View => v === 'watch' || v === 'lab';

export const loadView = (): View => {
  try {
    const v = localStorage.getItem(KEY);
    return isView(v) ? v : 'watch';
  } catch { return 'watch'; }
};

export const saveView = (v: View): void => {
  try { localStorage.setItem(KEY, v); } catch { /* private mode: the view just is not remembered */ }
};

let wanted: View | null = null;
const listeners = new Set<(v: View) => void>();

/** Routing asks for a view (possibly before the Studio exists); the Studio hears the pending request when it subscribes. */
export const requestView = (v: View): void => {
  wanted = v;
  listeners.forEach((fn) => fn(v));
};

export const onViewRequest = (fn: (v: View) => void): void => {
  listeners.add(fn);
  if (wanted) fn(wanted);
};
