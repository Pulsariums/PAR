import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

import { ChunkBuilder, modelFields } from '../../src/format/chunk';
import { LineScanner } from '../../src/format/scan';

/** `stats <file.ass> [maxLines]`: where do the bytes of one columnar chunk go (raw vs deflate, per stream)? */
const [file, maxLines = '20000'] = process.argv.slice(2);
const text = readFileSync(file, 'utf8').split('\n');
const sc = new LineScanner();
const b = new ChunkBuilder();
let n = 0;
let src = 0;
text.forEach((line, i) => {
  const c = sc.scan(line);
  if (c.t !== 'event' || n >= Number(maxLines)) return;
  const m = sc.formats[c.fmt]?.standard ? modelFields(line, c.comment) : null;
  if (!m) return;
  b.add({ lineNo: i, comment: c.comment, ordinal: c.ordinal, startMs: m.startCs * 10, endMs: m.endCs * 10, fmt: c.fmt, raw: null, m }, line.length + 1);
  src += line.length + 1;
  n++;
});
const sizes = b.sw.sizes();
let rawTotal = 0;
let defTotal = 0;
const rows: Array<[number, number, number]> = [];
for (const [k, len] of sizes) {
  const d = deflateRawSync(b.sw.bytesOf(k), { level: 9 }).length;
  rawTotal += len;
  defTotal += d;
  rows.push([k, len, d]);
}
rows.sort((x, y) => y[2] - x[2]);
console.log(`${n} events, source ${src} B, transformed ${rawTotal} B, per-stream deflate sum ${defTotal} B, whole-chunk deflate ${deflateRawSync(b.finish(), { level: 9 }).length} B`);
for (const [k, len, d] of rows.slice(0, 18)) console.log(`key ${String(k).padStart(5)}  raw ${String(len).padStart(8)}  deflate ${String(d).padStart(8)}  ${(d / n).toFixed(2)} B/event`);

const refs = b.sw.bytesOf(8);
const hist = new Map<number, number>();
for (const v of refs) hist.set(v, (hist.get(v) ?? 0) + 1);
console.log('ref symbol histogram (byte -> count):', [...hist].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, c]) => `${k}:${c}`).join(' '));
const d432 = b.sw.bytesOf(432);
const dh = new Map<number, number>();
for (const v of d432) dh.set(v, (dh.get(v) ?? 0) + 1);
console.log('pos.x delta bytes:', [...dh].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, c]) => `${k}:${c}`).join(' '));

import { ByteReader } from '../../src/format/bytes';
for (const key of [432, 433, 120, 336]) {
  const r = new ByteReader(b.sw.bytesOf(key));
  const buckets = new Map<string, number>();
  while (r.left > 0) {
    const v = Math.abs(r.sv());
    const k = v === 0 ? '0' : v <= 2 ? '1-2' : v <= 10 ? '3-10' : v <= 100 ? '11-100' : v <= 1000 ? '101-1000' : '>1000';
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  console.log(`stream ${key} |delta| buckets:`, [...buckets].map(([k, c]) => `${k}:${c}`).join('  '));
}
