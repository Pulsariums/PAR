import type { FontProvider } from '../fonts/provider';

import type { FontLibrary } from './FontLibrary';

/** The library as a `FontProvider`. Unreadable entries answer null, they never throw into the renderer. */
export const asProvider = (lib: FontLibrary, name: string): FontProvider => ({
  name,
  async has(family) { return (await lib.lookup(family)).length > 0; },
  async get(family, { weight, italic }) {
    const rec = await lib.find(family, weight, italic);
    return rec ? lib.bytes(rec.id) : null;
  },
  subscribe: (fn) => lib.onChange(fn),
});
