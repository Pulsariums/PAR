import { readFileSync, writeFileSync } from 'node:fs';

import { analyzeAss, summaryText } from '../../src/analyze';

const flag = (a: string[], n: string): string | undefined => {
  const i = a.indexOf(n);
  return i === -1 ? undefined : a[i + 1];
};
const num = (a: string[], n: string): number | undefined => (flag(a, n) === undefined ? undefined : Number(flag(a, n)));

const USAGE = 'usage: par analyze <in.ass> [--json] [--out file.json] [--fps N] [--width PX] [--burst N] [--keys N] [--no-chains]';

/** `par analyze <in.ass> [--json]`: burst map, sprite keys and build cost, canvas eligibility, frame-by-frame runs, unused styles. */
export const analyzeCmd = async (a: string[]): Promise<void> => {
  const input = a.find((x) => !x.startsWith('--') && !['--fps', '--width', '--burst', '--keys', '--out'].includes(a[a.indexOf(x) - 1] ?? ''));
  if (!input) throw new Error(USAGE);
  const text = readFileSync(input, 'utf8');
  const t0 = performance.now();
  const report = await analyzeAss(text, {
    fps: num(a, '--fps'), width: num(a, '--width'), burstMin: num(a, '--burst'), listKeys: num(a, '--keys'), chains: !a.includes('--no-chains'),
    onProgress: process.stderr.isTTY ? (f) => process.stderr.write(`\r${Math.round(f * 100)}%`) : undefined,
  });
  if (process.stderr.isTTY) process.stderr.write('\r    \r');
  const json = JSON.stringify(report);
  const out = flag(a, '--out');
  if (out) writeFileSync(out, json);
  if (a.includes('--json')) { process.stdout.write(`${json}\n`); return; }
  console.log(`${input}  (${((performance.now() - t0) / 1000).toFixed(1)} s)\n${summaryText(report)}`);
};
