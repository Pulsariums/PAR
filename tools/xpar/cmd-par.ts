import { Baker } from '../../src/format/bake';
import { pump } from '../../src/format/encoder';

import { fileSize, mb, openOut, readChunks } from './node-io';

const flag = (a: string[], n: string): string | undefined => {
  const i = a.indexOf(n);
  return i === -1 ? undefined : a[i + 1];
};

/** `par bake <in.ass> <out.par> --fps N [--tol px] [--phase f] [--render-height px] [--no-merge]` */
export const bakeCmd = async (a: string[]): Promise<void> => {
  const [input, output] = a;
  const fps = Number(flag(a, '--fps'));
  if (!input || !output || !fps) throw new Error('usage: par bake <in.ass> <out.par> --fps N [--tol px] [--phase f] [--render-height px] [--no-merge]');
  const out = openOut(output);
  const t0 = performance.now();
  const b = new Baker((u) => out.write(u), {
    fps,
    tolPx: Number(flag(a, '--tol') ?? 0.125),
    phase: Number(flag(a, '--phase') ?? 0),
    renderHeight: flag(a, '--render-height') ? Number(flag(a, '--render-height')) : null,
    merge: !a.includes('--no-merge'),
  });
  await pump(readChunks(input), (c) => b.push(c));
  await b.finish();
  await out.end();
  const s = (performance.now() - t0) / 1000;
  const st = b.stats;
  console.log(`${input}: ${mb(fileSize(input))} MB -> ${output}: ${mb(out.bytes())} MB (ratio ${(fileSize(input) / out.bytes()).toFixed(1)}x, ${s.toFixed(1)} s)`);
  console.log(`events in ${st.eventsIn}, out ${st.eventsOut}, dropped (no frame) ${st.dropped}, merged ${st.merged}, one-frame animations collapsed ${st.collapsed}`);
  console.log('LOSSY and one-way: the original ASS cannot be reproduced from this file.');
};


