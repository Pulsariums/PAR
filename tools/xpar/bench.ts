import { openAsBlob } from 'node:fs';
import { gzipSync } from 'node:zlib';

import { decodeXparTo, encodeXparTo, indexAss, openXpar, type EncodeOptions } from '../../src/format';
import { Baker } from '../../src/format/bake';
import { pump } from '../../src/format/pump';

import { baselines } from './bench-base';
import { fileSize, mb, newHash, readChunks } from './node-io';

/** `bench <file.ass> <xpar|base|bake> [options]`: prints one JSON object per stage to stdout. */
const [file, mode, ...rest] = process.argv.slice(2);
const out = (o: unknown): void => console.log(JSON.stringify(o));
const size = fileSize(file);

/** Peak RSS / heap sampler (the encoders yield to the event loop between 1 MB slices, so timers fire). */
const sampler = (): { stop: () => { rssMB: number; heapMB: number } } => {
  let rss = 0;
  let heap = 0;
  const t = setInterval(() => {
    const m = process.memoryUsage();
    rss = Math.max(rss, m.rss);
    heap = Math.max(heap, m.heapUsed);
  }, 25);
  return { stop: () => (clearInterval(t), { rssMB: +mb(rss), heapMB: +mb(heap) }) };
};

const timed = async <T>(f: () => Promise<T>): Promise<[T, number, { rssMB: number; heapMB: number }]> => {
  (globalThis as { gc?: () => void }).gc?.();
  const s = sampler();
  const t0 = performance.now();
  const r = await f();
  const sec = (performance.now() - t0) / 1000;
  return [r, sec, s.stop()];
};

const collect = (parts: Uint8Array[]): Uint8Array => {
  const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const c of parts) (o.set(c, p), (p += c.length));
  return o;
};

const med = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const xparStage = async (codec: 'rc' | 'deflate'): Promise<void> => {
  const parts: Uint8Array[] = [];
  const opts: EncodeOptions = { codec, ...(process.env.CHUNK ? { chunkBytes: Number(process.env.CHUNK), minChunkBytes: Math.min(32768, Number(process.env.CHUNK)) } : {}) };
  const [, encS, encMem] = await timed(() => encodeXparTo(readChunks(file), (b) => void parts.push(b), opts));
  const x = collect(parts);
  const f = await openXpar(x);
  const h = newHash();
  const [, decS, decMem] = await timed(() => decodeXparTo(f, (b) => void h.update(b)));
  const oh = newHash();
  for await (const c of readChunks(file)) oh.update(c);
  const exact = h.digest('hex') === oh.digest('hex');
  // windows: cold open + read, 2 s and one-frame windows at five positions
  const dur = f.duration;
  const w2: number[] = [];
  const w1: number[] = [];
  const nChunks: number[] = [];
  for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const g = await openXpar(x);
    const t = dur * frac;
    let t0 = performance.now();
    await g.readWindow(t, t + 2);
    w2.push(performance.now() - t0);
    nChunks.push(g.chunksFor(t, t + 2).length);
    const g2 = await openXpar(x);
    t0 = performance.now();
    await g2.readWindow(t, t + 1 / 24);
    w1.push(performance.now() - t0);
  }
  const gz = gzipSync(x, { level: 9 }).length;
  out({ stage: `xpar-${codec}`, srcBytes: size, xparBytes: x.length, ratio: +(size / x.length).toFixed(2), encSec: +encS.toFixed(1), encMBps: +(size / 1048576 / encS).toFixed(2), decSec: +decS.toFixed(1), decMBps: +(size / 1048576 / decS).toFixed(2), byteExact: exact, encMem, decMem, chunks: f.chunks.length, window2sMs: +med(w2).toFixed(0), window1frameMs: +med(w1).toFixed(0), chunksPer2s: med(nChunks), plusGzipBytes: gz, plusGzipRatio: +(size / gz).toFixed(2) });
};

const indexStage = async (): Promise<void> => {
  const blob = await openAsBlob(file);
  const [ix, sec, mem] = await timed(() => indexAss(blob));
  (globalThis as { gc?: () => void }).gc?.();
  const heapAfter = process.memoryUsage().heapUsed;
  const times: number[] = [];
  for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const t = ix.duration * frac;
    const t0 = performance.now();
    const ev = await ix.readWindow(t, t + 2);
    times.push(performance.now() - t0);
    if (ev.length === 0) console.error('warning: empty window');
  }
  out({ stage: 'index', srcBytes: size, seconds: +sec.toFixed(1), MBps: +(size / 1048576 / sec).toFixed(1), ranges: ix.ranges.length, events: ix.data.events, peak: mem, heapAfterIndexMB: +mb(heapAfter), window2sMs: +med(times).toFixed(0) });
};

const bakeStage = async (fps: number, tol: number): Promise<void> => {
  const parts: Uint8Array[] = [];
  const b = new Baker((u) => void parts.push(u), { fps, tolPx: tol });
  const [, sec, mem] = await timed(async () => {
    await pump(readChunks(file), (c) => b.push(c));
    await b.finish();
  });
  const x = collect(parts);
  out({ stage: `bake-${fps}fps-tol${tol}`, srcBytes: size, parBytes: x.length, ratio: +(size / x.length).toFixed(2), sec: +sec.toFixed(1), stats: b.stats, mem });
};

if (mode === 'xpar') {
  await xparStage('rc');
  if (rest.includes('--deflate')) await xparStage('deflate');
} else if (mode === 'index') await indexStage();
else if (mode === 'bake') await bakeStage(Number(rest[0]), Number(rest[1] ?? 0.125));
else if (mode === 'base') for (const r of await baselines(file, rest)) out({ stage: 'baseline', ...r, srcBytes: size, ratio: +(size / r.bytes).toFixed(2) });
else console.error('usage: bench <file> <xpar|index|bake|base> ...');
