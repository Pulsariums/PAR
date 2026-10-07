import { cssFamilies } from '../../fonts/resolver';
import type { SpriteSpec } from '../types';

export interface FaceInfo { key: string; family: string; weight: number; italic: boolean; data: Uint8Array }

/** A single font above this size stays on the main thread (its sprites are built there). */
export const MAX_FACE = 24 << 20;

const lc = (s: string): string => s.toLowerCase();

/**
 * Which of the page's faces the workers carry. Faces are shipped by use, family by family, when a sprite needs them (a library of a
 * hundred fonts costs a worker nothing until a script draws with one), within a byte budget per worker. The rule that keeps pixels
 * identical: a sprite goes to a worker only if every family of its font list that the page holds as a face is registered there;
 * a family that was too big, over budget or failed to register keeps all of its sprites on the main thread.
 */
export class FaceBook {
  private faces: FaceInfo[] = [];
  private readonly used = new Set<string>();
  private readonly out = new Set<string>();
  private bytes = 0;

  constructor(private readonly budget: number) {}

  /** A new set of faces (fonts changed): usage and exclusions start over. */
  set(faces: FaceInfo[]): void {
    this.faces = faces;
    this.used.clear();
    this.out.clear();
    this.bytes = 0;
  }

  private held(fam: string): FaceInfo[] { return this.faces.filter((f) => lc(f.family) === fam); }

  /** The families of the spec the page holds as faces. */
  private families(spec: SpriteSpec): string[] {
    const names = cssFamilies(spec.family).map(lc);
    return names.filter((n, i) => names.indexOf(n) === i && this.faces.some((f) => lc(f.family) === n));
  }

  /** Registers the spec's families for shipping; false when one of them cannot be shipped (the spec stays on the main thread). `grew`: new faces to send. */
  take(spec: SpriteSpec): { ok: boolean; grew: boolean } {
    let grew = false;
    for (const fam of this.families(spec)) {
      if (this.out.has(fam)) return { ok: false, grew };
      if (this.used.has(fam)) continue;
      const size = this.held(fam).reduce((n, f) => n + f.data.byteLength, 0);
      if (this.held(fam).some((f) => f.data.byteLength > MAX_FACE) || this.bytes + size > this.budget) { this.out.add(fam); return { ok: false, grew }; }
      this.used.add(fam);
      this.bytes += size;
      grew = true;
    }
    return { ok: true, grew };
  }

  /** Same decision without registering anything. */
  allows(spec: SpriteSpec): boolean { return !this.families(spec).some((f) => this.out.has(f)); }

  /** The faces a worker must hold now. */
  wanted(): Map<string, FaceInfo> {
    return new Map(this.faces.filter((f) => this.used.has(lc(f.family)) && !this.out.has(lc(f.family))).map((f) => [f.key, f]));
  }

  /** Faces a worker could not register: their families leave the workers for good (until the set changes). */
  failed(keys: readonly string[]): void {
    for (const f of this.faces) if (keys.includes(f.key)) this.out.add(lc(f.family));
  }
}
