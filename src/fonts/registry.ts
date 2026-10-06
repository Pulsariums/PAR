import { browserHost, type FontFaceLike, type FontHost } from './host';
import type { ParsedFace } from './loader';
import { sizeRatio } from './ratio';

export interface RegisteredFace {
  key: string;
  /** Family the browser knows the face under. */
  family: string;
  parsed: ParsedFace;
  weight: number;
  italic: boolean;
  /** `\fs` factor from the font's own metrics, null when unknown. */
  ratio: number | null;
  state: 'loading' | 'loaded' | 'failed';
  error?: string;
  /** Settles (never rejects) once `state` is final. */
  loaded: Promise<void>;
}

interface Entry {
  face: RegisteredFace;
  ff: FontFaceLike | null;
  owners: Set<object>;
}

/**
 * Process-wide, content-addressed font registry: identical bytes are registered with `document.fonts` once,
 * reference-counted per owner (a renderer), and removed again when the last owner releases them.
 */
export class FontRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly hostFor: () => FontHost | null = browserHost) {}

  get size(): number {
    return this.entries.size;
  }

  refCount(key: string): number {
    return this.entries.get(key)?.owners.size ?? 0;
  }

  /** Registers `parsed` (or joins the existing registration) on behalf of `owner`. */
  acquire(owner: object, parsed: ParsedFace): RegisteredFace {
    const hit = this.entries.get(parsed.key);
    if (hit) { hit.owners.add(owner); return hit.face; }
    const { info } = parsed;
    const face: RegisteredFace = {
      key: parsed.key, family: info.family, parsed, weight: info.weight, italic: info.italic,
      ratio: sizeRatio(info.metrics), state: 'loading', loaded: Promise.resolve(),
    };
    const entry: Entry = { face, ff: null, owners: new Set([owner]) };
    this.entries.set(parsed.key, entry);
    const host = this.hostFor();
    if (!host) { face.state = 'loaded'; return face; }
    face.loaded = this.start(entry, host);
    return face;
  }

  private async start(entry: Entry, host: FontHost): Promise<void> {
    const { face } = entry;
    const { parsed } = face;
    try {
      const d = parsed.data;
      const buf = d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer;
      entry.ff = host.create(face.family, buf, face.weight, face.italic);
      await entry.ff.load();
      if (this.entries.get(face.key) !== entry) return;
      host.add(entry.ff);
      face.state = 'loaded';
    } catch (e) {
      face.state = 'failed';
      face.error = e instanceof Error ? e.message : String(e);
    }
  }

  release(owner: object, key: string): void {
    const e = this.entries.get(key);
    if (!e || !e.owners.delete(owner) || e.owners.size > 0) return;
    this.entries.delete(key);
    const host = this.hostFor();
    if (e.ff && host && e.face.state === 'loaded') host.remove(e.ff);
  }
}

/** The shared instance every renderer uses unless given its own. */
export const defaultRegistry = new FontRegistry();
