import type { FontFaceLike, FontHost } from '../../src/fonts/host';

/** A FontHost that records what the registry does; `load` resolves on the next tick unless `failFor` matches. */
export class FakeHost implements FontHost {
  readonly created: Array<{ family: string; weight: number; italic: boolean; bytes: number }> = [];
  readonly active = new Set<FontFaceLike>();
  failFor: ((family: string) => boolean) | null = null;
  /** Holds every load() until `release()` (to test the "still loading" gate). */
  hold = false;
  private waiters: Array<() => void> = [];

  create(family: string, data: ArrayBuffer, weight: number, italic: boolean): FontFaceLike {
    this.created.push({ family, weight, italic, bytes: data.byteLength });
    return {
      load: async () => {
        if (this.hold) await new Promise<void>((r) => this.waiters.push(r));
        if (this.failFor?.(family)) throw new Error('decode failed');
      },
    };
  }

  add(f: FontFaceLike): void { this.active.add(f); }
  remove(f: FontFaceLike): void { this.active.delete(f); }
  release(): void { this.hold = false; this.waiters.splice(0).forEach((r) => r()); }
}
