import { readFileSync } from 'node:fs';
import { decodeChunk } from '../../src/format/chunk';
import { decodeBlock } from '../../src/format/codec';
import { openXpar } from '../../src/format';

/** `prof <file.xpar>`: split decode time into entropy decoding vs. structure decoding. */
const x = new Uint8Array(readFileSync(process.argv[2]));
const f = await openXpar(x);
let tEnt = 0, tStr = 0, raw = 0, ev = 0;
for (const c of f.chunks) {
  const data = x.subarray(c.offset, c.offset + c.len);
  let t = performance.now();
  const r = await decodeBlock(data, c.codec, c.rawLen);
  tEnt += performance.now() - t;
  t = performance.now();
  decodeChunk(r, c.count);
  tStr += performance.now() - t;
  raw += r.length; ev += c.count;
}
console.log(`chunks ${f.chunks.length} events ${ev} raw ${(raw / 1048576).toFixed(1)} MB: entropy ${tEnt.toFixed(0)} ms (${(raw / 1048576 / (tEnt / 1000)).toFixed(1)} MB/s raw), structure ${tStr.toFixed(0)} ms (${(ev / tStr).toFixed(0)} events/ms)`);
