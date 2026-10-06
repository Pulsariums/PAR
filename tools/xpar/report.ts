import { existsSync, readFileSync } from 'node:fs';

/** `report <results-dir>`: turns the JSON lines written by `bench` into the markdown tables of docs/formats. */
const dir = process.argv[2];
const profiles = ['a-text-60', 'a-text-24', 'b-draw-24', 'c-episode'];
const read = (p: string, kind: string): Array<Record<string, any>> => {
  const f = `${dir}/${p}.${kind}.jsonl`;
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const mb = (n: number): string => (n / 1048576).toFixed(2);
const x = (n: number): string => `${n.toFixed(1)}x`;

console.log('### Size (lossless) and ratio vs source\n');
console.log('| profile | source MB | gzip -9 | deflate-raw 6 | brotli q9 | zstd 19 | xz -6 | xz -9e | XPAR deflate | **XPAR (own coder)** | XPAR + gzip |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const p of profiles) {
  const base = read(p, 'base');
  const xp = read(p, 'xpar');
  const get = (re: RegExp): string => {
    const r = base.find((b) => re.test(b.name));
    return r ? `${mb(r.bytes)} MB (${x(r.ratio)})` : 'n/a';
  };
  const rc = xp.find((r) => r.stage === 'xpar-rc');
  const df = xp.find((r) => r.stage === 'xpar-deflate');
  console.log(`| ${p} | ${rc ? mb(rc.srcBytes) : '?'} | ${get(/gzip/)} | ${get(/deflate-raw/)} | ${get(/brotli/)} | ${get(/zstd/)} | ${get(/xz -6/)} | ${get(/xz -9e/)} | ${df ? `${mb(df.xparBytes)} MB (${x(df.ratio)})` : 'n/a'} | **${rc ? `${mb(rc.xparBytes)} MB (${x(rc.ratio)})` : 'n/a'}** | ${rc ? `${mb(rc.plusGzipBytes)} MB (${x(rc.plusGzipRatio)})` : 'n/a'} |`);
}
console.log('\n### Speed and seek cost (single thread, Node 22, one machine; MB/s of SOURCE text)\n');
console.log('| profile | codec | encode MB/s | decode all MB/s | chunks | chunks per 2 s window | 2 s window ms (cold) | 1 frame window ms (cold) | byte exact |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const p of profiles) for (const r of read(p, 'xpar')) console.log(`| ${p} | ${r.stage.replace('xpar-', '')} | ${r.encMBps} | ${r.decMBps} | ${r.chunks} | ${r.chunksPer2s} | ${r.window2sMs} | ${r.window1frameMs} | ${r.byteExact} |`);
console.log('\n### Plain-ASS index (no conversion)\n');
console.log('| profile | source MB | index time s | MB/s | runs | events | peak RSS MB | heap after index MB | 2 s window ms |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const p of profiles) for (const r of read(p, 'index')) console.log(`| ${p} | ${mb(r.srcBytes)} | ${r.seconds} | ${r.MBps} | ${r.ranges} | ${r.events} | ${r.peak.rssMB} | ${r.heapAfterIndexMB} | ${r.window2sMs} |`);
console.log('\n### Lossy PAR bake\n');
console.log('| profile | fps | PAR MB | ratio | lossless XPAR MB | events in | out | dropped | merged | collapsed |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const p of profiles) {
  const xp = read(p, 'xpar').find((r) => r.stage === 'xpar-rc');
  for (const r of read(p, 'bake')) console.log(`| ${p} | ${/bake-(\d+)fps/.exec(r.stage)![1]} | ${mb(r.parBytes)} | ${x(r.ratio)} | ${xp ? mb(xp.xparBytes) : '?'} | ${r.stats.eventsIn} | ${r.stats.eventsOut} | ${r.stats.dropped} | ${r.stats.merged} | ${r.stats.collapsed} |`);
}
