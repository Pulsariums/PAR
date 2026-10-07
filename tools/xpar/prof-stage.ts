import { readFileSync, writeFileSync } from 'node:fs';

import { decodeXparTo, encodeXparTo, openXpar } from '../../src/format';
import { Baker } from '../../src/format/bake';
import { pump } from '../../src/format/pump';
import { analyzeAss } from '../../src/analyze';
import { optimizeAss } from '../../src/optimize';

import { setWasmEnabled } from '../../src/wasm/load';

import { readChunks } from './node-io';

/** `prof-stage <encode|decode|bake|optimize|analyze> <file> [out]`: wall time of one stage (use with NODE_OPTIONS=--cpu-prof). */
const [stage, file, out] = process.argv.slice(2);
if (process.env.NO_WASM) setWasmEnabled(false);
const t0 = performance.now();
let info = '';
if (stage === 'encode') {
  const parts: Uint8Array[] = [];
  await encodeXparTo(readChunks(file), (b) => void parts.push(b), {});
  const n = parts.reduce((a, p) => a + p.length, 0);
  if (out) writeFileSync(out, Buffer.concat(parts));
  info = `${n} bytes`;
} else if (stage === 'decode') {
  const f = await openXpar(new Uint8Array(readFileSync(file)));
  let n = 0;
  await decodeXparTo(f, (b) => void (n += b.length));
  info = `${n} bytes`;
} else if (stage === 'bake') {
  const parts: Uint8Array[] = [];
  const b = new Baker((u) => void parts.push(u), { fps: 24, tolPx: 0.125 });
  await pump(readChunks(file), (c) => b.push(c));
  await b.finish();
  const n = parts.reduce((a, p) => a + p.length, 0);
  if (out) writeFileSync(out, Buffer.concat(parts));
  info = `${n} bytes`;
} else if (stage === 'optimize') {
  const r = await optimizeAss(readFileSync(file, 'utf8'), { fps: 24, mode: 'invisible' });
  if (out) writeFileSync(out, r.text);
  info = JSON.stringify(r.stats);
} else if (stage === 'analyze') {
  const r = await analyzeAss(readFileSync(file, 'utf8'), { fps: 24 });
  if (out) writeFileSync(out, JSON.stringify(r));
  info = 'done';
} else throw new Error('stage?');
console.log(`${stage} ${((performance.now() - t0) / 1000).toFixed(2)} s  ${info}`);
