import { isZip, readZip } from '../../../src/fonts/zip';
import { FONT_FILE } from '../player/dnd';

/** Font files only (a zip is opened, a font inside a zip counts by its own name). */
const FONT_ONLY = /\.(ttf|otf|ttc|otc|woff2?)$/i;

export const isFontFile = (name: string): boolean => FONT_FILE.test(name);

/** `Fonts/Arial Bold.ttf` -> `Arial Bold.ttf`. */
const leaf = (p: string): string => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);

/**
 * The fonts to attach to the next conversion: files picked or dropped (zips are opened and their fonts taken), de-duplicated by name and
 * size. They are only read when a conversion runs, and stored byte for byte.
 */
export class FontBox {
  private files: File[] = [];
  /** Names that could not be read as a font or a zip of fonts. */
  rejected: string[] = [];

  get list(): readonly File[] { return this.files; }
  get bytes(): number { return this.files.reduce((n, f) => n + f.size, 0); }

  async add(picked: readonly File[]): Promise<void> {
    this.rejected = [];
    for (const f of picked) {
      try {
        const data = new Uint8Array(await f.arrayBuffer());
        if (isZip(data)) {
          const entries = await readZip(data, (n) => FONT_ONLY.test(n));
          if (entries.length === 0) this.rejected.push(f.name);
          for (const e of entries) this.put(new File([e.data as BlobPart], leaf(e.name)));
        } else if (FONT_ONLY.test(f.name)) this.put(f);
        else this.rejected.push(f.name);
      } catch { this.rejected.push(f.name); }
    }
  }

  private put(f: File): void {
    if (!this.files.some((x) => x.name === f.name && x.size === f.size)) this.files.push(f);
  }

  remove(i: number): void { this.files.splice(i, 1); }
  clear(): void { this.files = []; }
}
