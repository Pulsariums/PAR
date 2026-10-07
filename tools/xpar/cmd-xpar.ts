import { decodeXparTo, encodeXparTo, openXpar, type EncodeOptions } from '../../src/format';

import { mkdirSync } from 'node:fs';

import { loadFonts, saveFont } from './fonts-io';
import { fileSize, fileSource, mb, newHash, openOut, readChunks } from './node-io';

const flag = (a: string[], name: string): string | undefined => {
  const i = a.indexOf(name);
  return i === -1 ? undefined : a[i + 1];
};

export const encOptions = (a: string[]): EncodeOptions => {
  const o: EncodeOptions = {};
  const codec = flag(a, '--codec');
  if (codec) o.codec = codec as EncodeOptions['codec'];
  const cb = flag(a, '--chunk-bytes');
  if (cb) o.chunkBytes = Number(cb);
  const fonts = loadFonts(a);
  if (fonts.length) o.fonts = fonts;
  return o;
};

export const encode = async (a: string[]): Promise<void> => {
  const [input, output] = a;
  const out = openOut(output);
  const t0 = performance.now();
  await encodeXparTo(readChunks(input), (b) => out.write(b), encOptions(a));
  await out.end();
  const s = (performance.now() - t0) / 1000;
  const inBytes = fileSize(input);
  console.log(`${input}: ${mb(inBytes)} MB -> ${output}: ${mb(out.bytes())} MB  ratio ${(inBytes / out.bytes()).toFixed(2)}x  ${s.toFixed(1)} s  ${(inBytes / 1048576 / s).toFixed(1)} MB/s`);
};

export const decode = async (a: string[]): Promise<void> => {
  const [input, output] = a;
  const file = await openXpar(fileSource(input));
  const out = openOut(output);
  const t0 = performance.now();
  await decodeXparTo(file, (b) => out.write(b));
  await out.end();
  const s = (performance.now() - t0) / 1000;
  console.log(`${input} -> ${output}: ${mb(out.bytes())} MB  ${s.toFixed(1)} s  ${(out.bytes() / 1048576 / s).toFixed(1)} MB/s${file.lossy ? '  (LOSSY file: output is the baked ASS, not the original)' : ''}`);
};

export const info = async (a: string[]): Promise<void> => {
  const f = await openXpar(fileSource(a[0]));
  const m = f.meta;
  const stored = f.chunks.reduce((n, c) => n + c.len, 0);
  const raw = f.chunks.reduce((n, c) => n + c.rawLen, 0);
  console.log(`file         ${a[0]} (${mb(fileSize(a[0]))} MB, ${f.lossy ? 'lossy PAR' : 'lossless XPAR'})`);
  console.log(`lines        ${m.lines}   events ${m.events}   dialogues ${m.dialogues}   misc lines ${m.misc.length}`);
  console.log(`duration     ${f.duration.toFixed(2)} s`);
  console.log(`chunks       ${f.chunks.length}   stored ${mb(stored)} MB   raw ${mb(raw)} MB`);
  console.log(`bom ${m.bom}  crlf ${m.crlf}  final newline ${m.finalNewline}  eol exceptions ${m.eolExceptions.length}  fonts ${m.fonts.length}`);
  if (m.params) console.log(`params       ${m.params}`);
  const ev = f.chunks.map((c) => c.count);
  console.log(`events/chunk min ${Math.min(...ev)}  max ${Math.max(...ev)}`);
};

/** Encode in memory-light mode, decode again, compare SHA-256 of the original and the decoded bytes. */
export const verify = async (a: string[]): Promise<void> => {
  const input = a[0];
  const parts: Uint8Array[] = [];
  await encodeXparTo(readChunks(input), (b) => void parts.push(b), encOptions(a));
  const size = parts.reduce((n, p) => n + p.length, 0);
  const all = new Uint8Array(size);
  let p = 0;
  for (const c of parts) {
    all.set(c, p);
    p += c.length;
  }
  const file = await openXpar(all);
  const dh = newHash();
  await decodeXparTo(file, (b) => void dh.update(b));
  const oh = newHash();
  for await (const c of readChunks(input)) oh.update(c);
  const same = dh.digest('hex') === oh.digest('hex');
  console.log(`${input}: round-trip ${same ? 'BYTE-EXACT' : 'MISMATCH'} (xpar ${mb(size)} MB)`);
  if (!same) process.exit(1);
};

/** List the attached fonts; with an output directory also write each back, byte for byte. */
export const fonts = async (a: string[]): Promise<void> => {
  const [input, dir] = a;
  const f = await openXpar(fileSource(input));
  if (dir) mkdirSync(dir, { recursive: true });
  for (const x of f.fonts) {
    const bytes = dir ? await x.read() : null;
    if (bytes && dir) saveFont(dir, x.name, bytes);
    console.log(`${x.name}  ${x.size} bytes  stored ${x.stored}${bytes ? '  -> ' + dir : ''}`);
  }
  if (!f.fonts.length) console.log('no fonts attached');
};
