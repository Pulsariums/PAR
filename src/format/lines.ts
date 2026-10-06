import { fail, LIMITS } from './errors';

/** Callback gets the line WITHOUT its terminator; `eol` = 0 none (last line), 1 LF, 2 CRLF. The bytes are a view: copy to keep. */
export type LineHandler = (bytes: Uint8Array, eol: 0 | 1 | 2) => void;

/** Splits a byte stream at LF (UTF-8 safe), carrying partial lines between chunks. A lone CR is ordinary text. */
export class LineSplitter {
  private parts: Uint8Array[] = [];
  private carryLen = 0;

  private emit(line: Uint8Array, h: LineHandler): void {
    if (line.length > 0 && line[line.length - 1] === 13) h(line.subarray(0, line.length - 1), 2);
    else h(line, 1);
  }

  private join(tail: Uint8Array): Uint8Array {
    const out = new Uint8Array(this.carryLen + tail.length);
    let p = 0;
    for (const c of this.parts) {
      out.set(c, p);
      p += c.length;
    }
    out.set(tail, p);
    this.parts = [];
    this.carryLen = 0;
    return out;
  }

  push(chunk: Uint8Array, h: LineHandler): void {
    let start = 0;
    for (;;) {
      const nl = chunk.indexOf(10, start);
      if (nl === -1) break;
      const part = chunk.subarray(start, nl);
      this.emit(this.carryLen ? this.join(part) : part, h);
      start = nl + 1;
    }
    if (start < chunk.length) {
      this.carryLen += chunk.length - start;
      if (this.carryLen > LIMITS.maxLineBytes) fail('LIMIT', 'line longer than the supported maximum');
      this.parts.push(chunk.slice(start));
    }
  }

  /** Flushes a final line that has no terminator. */
  end(h: LineHandler): void {
    if (this.carryLen > 0) h(this.join(new Uint8Array(0)), 0);
  }
}
