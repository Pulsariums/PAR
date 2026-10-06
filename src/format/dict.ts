import { fail, LIMITS } from './errors';
import type { StreamReader, StreamWriter } from './streams';

export const KEY_STR = 4;

/** Chunk-local string dictionary: first use ships the string (stream KEY_STR), later uses ship an index. */
export class DictWriter {
  private readonly map = new Map<string, number>();
  /** Writes the index of `s` into stream `key`. */
  put(sw: StreamWriter, key: number, s: string): void {
    let i = this.map.get(s);
    if (i === undefined) {
      i = this.map.size;
      this.map.set(s, i);
      sw.w(KEY_STR).str(s);
    }
    sw.w(key).uv(i);
  }
}

export class DictReader {
  private readonly list: string[] = [];
  get(sr: StreamReader, key: number): string {
    const i = sr.r(key).uv();
    if (i < this.list.length) return this.list[i];
    if (i !== this.list.length) return fail('CORRUPT', 'bad dictionary index');
    const s = sr.r(KEY_STR).str(LIMITS.maxStringLen);
    this.list.push(s);
    return s;
  }
}
