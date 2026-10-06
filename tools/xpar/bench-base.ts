import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { constants, createBrotliCompress, createGzip, createDeflateRaw } from 'node:zlib';
import * as zlib from 'node:zlib';

import { readChunks } from './node-io';

const countThrough = async (path: string, ts: NodeJS.ReadWriteStream): Promise<number> => {
  let n = 0;
  ts.on('data', (b: Uint8Array) => (n += b.length));
  const done = new Promise<void>((res, rej) => {
    ts.on('end', res);
    ts.on('error', rej);
  });
  createReadStream(path, { highWaterMark: 1 << 20 }).pipe(ts);
  await done;
  return n;
};

const xz = (path: string, level: string): Promise<number> =>
  new Promise((res, rej) => {
    const p = spawn('xz', [level, '-T1', '-c', path]);
    let n = 0;
    p.stdout.on('data', (b: Uint8Array) => (n += b.length));
    p.on('close', (c) => (c === 0 ? res(n) : rej(new Error(`xz exit ${c}`))));
  });

export interface BaseRow {
  name: string;
  bytes: number;
  seconds: number;
}

/** Dev-time comparison coders. None of them is used by the format; they only provide the reference column. */
export const baselines = async (path: string, which: string[]): Promise<BaseRow[]> => {
  const rows: BaseRow[] = [];
  const run = async (name: string, f: () => Promise<number>): Promise<void> => {
    const t0 = performance.now();
    rows.push({ name, bytes: await f(), seconds: (performance.now() - t0) / 1000 });
    console.error(`  baseline ${name}: ${rows[rows.length - 1].bytes} B in ${rows[rows.length - 1].seconds.toFixed(1)} s`);
  };
  if (which.includes('gzip9')) await run('gzip -9 (deflate)', () => countThrough(path, createGzip({ level: 9 })));
  if (which.includes('deflate6')) await run('deflate-raw level 6 (CompressionStream default class)', () => countThrough(path, createDeflateRaw({ level: 6 })));
  if (which.includes('brotli')) {
    await run('brotli q9 w24', () => countThrough(path, createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_LGWIN]: 24 } })));
  }
  const z = zlib as unknown as { createZstdCompress?: (o: unknown) => NodeJS.ReadWriteStream; constants: Record<string, number> };
  if (which.includes('zstd') && z.createZstdCompress) {
    await run('zstd level 19 (window 27)', () => countThrough(path, z.createZstdCompress!({ params: { [z.constants.ZSTD_c_compressionLevel]: 19, [z.constants.ZSTD_c_windowLog]: 27 } })));
  }
  if (which.includes('xz6')) await run('xz -6', () => xz(path, '-6'));
  if (which.includes('xz9e')) await run('xz -9e', () => xz(path, '-9e'));
  void readChunks;
  return rows;
};
