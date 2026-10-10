import { describe, expect, it } from 'vitest';

import { resolveOptions, validateWindow } from '../src/core/options';

type R = ReturnType<typeof resolveOptions>;
const base = (): R => resolveOptions({ container: document.body });

describe('windowSeconds / warmRangeSeconds coupling', () => {
  it('the default window follows the warm horizon: max(12, warmRangeSeconds + 8)', () => {
    expect(base().windowSeconds).toBe(68); // warmRange default 60
    const r = resolveOptions({ container: document.body, warmRangeSeconds: 20 });
    expect(r.windowSeconds).toBe(28);
    const small = resolveOptions({ container: document.body, warmRangeSeconds: 4 });
    expect(small.windowSeconds).toBe(12); // the floor stays
  });

  it('an explicit windowSeconds is kept untouched, now and through later patches', () => {
    const r = resolveOptions({ container: document.body, windowSeconds: 8, warmRangeSeconds: 60 });
    expect(r.windowSeconds).toBe(8);
    const later = resolveOptions({ container: document.body, warmRangeSeconds: 90 }, r);
    expect(later.windowSeconds).toBe(8); // the user value was explicit: warmRange never moves it
    const patched = resolveOptions({ container: document.body, windowSeconds: 15 }, base());
    expect(patched.windowSeconds).toBe(15);
    expect(resolveOptions({ container: document.body, warmRangeSeconds: 40 }, patched).windowSeconds).toBe(15);
  });

  it('while the window was never explicit, it keeps following later warmRange changes', () => {
    let r = resolveOptions({ container: document.body, warmRangeSeconds: 30 });
    expect(r.windowSeconds).toBe(38);
    r = resolveOptions({ container: document.body, warmRangeSeconds: 10 }, r);
    expect(r.windowSeconds).toBe(18);
    r = resolveOptions({ container: document.body }, r); // unchanged warm -> unchanged window
    expect(r.windowSeconds).toBe(18);
  });

  it('nothing is persisted and validation still applies', () => {
    expect(JSON.stringify(base())).not.toMatch(/localStorage/);
    expect(() => validateWindow(0.5)).toThrow(RangeError);
    expect(() => resolveOptions({ container: document.body, windowSeconds: 0.5 })).toThrow(RangeError);
    expect(() => resolveOptions({ container: document.body, warmRangeSeconds: 301 })).toThrow(RangeError);
  });
});
