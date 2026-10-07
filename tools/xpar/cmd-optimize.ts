import { readFileSync, writeFileSync } from 'node:fs';

import { optimizeAss, type OptimizeMode } from '../../src/optimize';

const flag = (a: string[], n: string): string | undefined => {
  const i = a.indexOf(n);
  return i === -1 ? undefined : a[i + 1];
};

/** `par optimize <in.ass> <out.ass> --fps N [--mode exact|invisible|loose] [--min-chain N]` */
export const optimizeCmd = async (a: string[]): Promise<void> => {
  const [input, output] = a;
  const fps = Number(flag(a, '--fps'));
  const mode = (flag(a, '--mode') ?? 'invisible') as OptimizeMode;
  if (!input || !output || !fps || !['exact', 'invisible', 'loose'].includes(mode)) throw new Error('usage: par optimize <in.ass> <out.ass> --fps N [--mode exact|invisible|loose] [--min-chain N]');
  const src = readFileSync(input, 'utf8');
  const t0 = performance.now();
  const r = await optimizeAss(src, { fps, mode, minChain: flag(a, '--min-chain') ? Number(flag(a, '--min-chain')) : undefined, onProgress: (f) => process.stderr.write(`\r${Math.round(f * 100)}%`) });
  process.stderr.write('\r    \r');
  writeFileSync(output, r.text);
  const s = r.stats;
  console.log(`${input}: ${s.eventsIn.toLocaleString('en-US')} events -> ${s.eventsOut.toLocaleString('en-US')} (${((1 - s.eventsOut / Math.max(1, s.eventsIn)) * 100).toFixed(1)} % fewer), ${(src.length / 1e6).toFixed(1)} MB -> ${(r.text.length / 1e6).toFixed(1)} MB, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`  mode ${mode} at ${fps} fps: ${s.chains} chains, ${s.merged} merged events, ${s.rejected} rejected by the check, ${s.orderConflicts} kept for drawing order, worst error ${(s.worstError * 100).toFixed(0)} % of the allowed`);
};
