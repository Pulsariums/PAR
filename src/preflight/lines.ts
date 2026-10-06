import type { LineSource } from './types';

const BATCH = 20000;

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export interface ScanHooks {
  signal?: AbortSignal;
  onProgress?(lines: number): void;
}

/**
 * Feeds `source` to `feed` one line at a time without ever holding the whole script in an array: a string is walked with
 * a sticky regex, iterables are consumed lazily. Yields to the event loop every few thousand lines (UI stays responsive)
 * and honours `signal`.
 */
export const eachLine = async (source: LineSource, feed: (line: string) => void, hooks: ScanHooks = {}): Promise<void> => {
  let n = 0;
  const step = async (line: string): Promise<void> => {
    feed(line);
    if (++n % BATCH !== 0) return;
    hooks.onProgress?.(n);
    if (hooks.signal?.aborted) throw new Error('preflight aborted');
    await tick();
  };
  const one = async (item: string): Promise<void> => {
    if (!/[\r\n]/.test(item)) return step(item);
    const re = /\r\n|\r|\n/g;
    let from = 0;
    for (let m = re.exec(item); m; m = re.exec(item)) { await step(item.slice(from, m.index)); from = m.index + m[0].length; }
    if (from < item.length) await step(item.slice(from));
  };
  if (typeof source === 'string') {
    const re = /\r\n|\r|\n/g;
    let from = 0;
    for (let m = re.exec(source); m; m = re.exec(source)) { await step(source.slice(from, m.index)); from = m.index + m[0].length; }
    if (from < source.length) await step(source.slice(from));
  } else if (Symbol.asyncIterator in source) for await (const item of source) await one(item);
  else for (const item of source) await one(item);
  hooks.onProgress?.(n);
};

/**
 * Turns a chunked text stream (`ReadableStream` of bytes or strings, `fetch(...).body`, an async iterable of chunks)
 * into lines, so a 100 MB script can be scanned while it downloads. Chunk borders may fall anywhere.
 */
export async function* linesFromChunks(chunks: AsyncIterable<string | Uint8Array> | ReadableStream<string | Uint8Array>): AsyncGenerator<string> {
  const dec = new TextDecoder();
  let carry = '';
  const it: AsyncIterable<string | Uint8Array> = Symbol.asyncIterator in chunks ? chunks : (async function* () {
    const reader = (chunks as ReadableStream<string | Uint8Array>).getReader();
    for (;;) { const r = await reader.read(); if (r.done) return; yield r.value; }
  })();
  for await (const c of it) {
    carry += typeof c === 'string' ? c : dec.decode(c, { stream: true });
    const parts = carry.split(/\r\n|\r|\n/);
    carry = parts.pop() ?? '';
    for (const p of parts) yield p;
  }
  carry += dec.decode();
  if (carry) yield carry;
}
