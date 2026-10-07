import { readFileSync } from 'node:fs';

import { positionAt } from '../../src/anim/LineAnim';
import { evalStates, prepareLine, type PreparedLine } from '../../src/anim/Prepared';
import { frameMs, frameRate } from '../../src/core/time';
import { parseScript } from '../../src/parser/ScriptParser';

/**
 * Independent check of `par optimize`: parse both files, take random video frames and compare what PAR would draw: the same events, the same
 * drawing order for events that surely overlap, and every number within the tolerance of the mode.
 * `verify-opt <original.ass> <optimized.ass> --fps N [--frames 300] [--mode invisible] [--seed 1]`
 */
const a = process.argv.slice(2);
const flag = (n: string, d: string): string => { const i = a.indexOf(n); return i < 0 ? d : a[i + 1]; };
const [fileA, fileB] = a;
const fps = Number(flag('--fps', '24')), nFrames = Number(flag('--frames', '300')), mode = flag('--mode', 'invisible');
const TOL = { exact: { pos: 0.0013, deg: 0.0013, scale: 0.0027, chan: 0.5 }, invisible: { pos: 0.126, deg: 0.13, scale: 0.28, chan: 2 }, loose: { pos: 0.51, deg: 0.5, scale: 1.1, chan: 4 } }[mode as 'exact'];
if (!fileA || !fileB || !TOL) throw new Error('usage: verify-opt <original.ass> <optimized.ass> --fps N [--frames N] [--mode exact|invisible|loose] [--seed N]');

const load = (f: string) => { const s = parseScript(readFileSync(f, 'utf8')); return { s, lines: s.events.map((e) => prepareLine(e, s.styles, s.info)) }; };
const A = load(fileA), B = load(fileB);
let seed = Number(flag('--seed', '1'));
const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const rate = frameRate(fps);
let duration = 0;
for (const l of A.lines) if (l.event.end * 1000 > duration) duration = l.event.end * 1000;
const NEAR = 40;

const shown = (set: typeof A, t: number) => {
  const vis = set.lines.filter((l: PreparedLine) => Math.round(l.event.start * 1000) <= t && t < Math.round(l.event.end * 1000)).sort((x, y) => x.event.layer - y.event.layer || x.event.index - y.event.index);
  return vis.map((l, i) => {
    const rel = t - Math.round(l.event.start * 1000);
    const st = evalStates(l, rel, set.s.styles)[0];
    return { i, layer: l.event.layer, key: `${l.event.layer}|${l.event.text.replace(/^\{[^}]*\}/, '')}|${l.event.style}`, pos: positionAt(l.event.lineTags, rel, l.durationMs), st };
  });
};

let problems = 0, checked = 0, pairs = 0;
const fail = (m: string): void => { if (problems++ < 10) console.log('  MISMATCH ' + m); };
for (let f = 0; f < nFrames; f++) {
  const k = Math.floor(rnd() * (duration / 1000) * fps);
  const t = frameMs(k, rate);
  const x = shown(A, t), y = shown(B, t);
  if (x.length !== y.length) { fail(`frame ${k}: ${x.length} events vs ${y.length}`); continue; }
  // match by (layer, text, style, nearest position): particles share glyph text, so position tells them apart
  const used = new Set<number>();
  const match = x.map((e) => {
    let best = -1, bd = Infinity;
    y.forEach((o, j) => { if (used.has(j) || o.key !== e.key) return; const d = e.pos && o.pos ? Math.hypot(e.pos[0] - o.pos[0], e.pos[1] - o.pos[1]) : 0; if (d < bd) { bd = d; best = j; } });
    if (best >= 0) used.add(best);
    return best;
  });
  x.forEach((e, i) => {
    const j = match[i];
    if (j < 0) { fail(`frame ${k}: no counterpart for ${e.key}`); return; }
    const o = y[j];
    checked++;
    if (e.pos && o.pos) for (let c = 0; c < 2; c++) if (Math.abs(e.pos[c] - o.pos[c]) > TOL.pos) fail(`frame ${k} pos ${e.pos} vs ${o.pos}`);
    for (const key of ['frx', 'fry', 'frz'] as const) if (Math.abs(e.st[key] - o.st[key]) > TOL.deg) fail(`frame ${k} ${key} ${e.st[key]} vs ${o.st[key]}`);
    for (const key of ['fscx', 'fscy'] as const) if (Math.abs(e.st[key] - o.st[key]) > TOL.scale) fail(`frame ${k} ${key} ${e.st[key]} vs ${o.st[key]}`);
    for (const key of ['a1', 'a2', 'a3', 'a4'] as const) if (Math.abs(e.st[key] - o.st[key]) > TOL.chan) fail(`frame ${k} ${key} ${e.st[key]} vs ${o.st[key]}`);
    for (const key of ['c1', 'c2', 'c3', 'c4'] as const) for (let sh = 0; sh <= 16; sh += 8) if (Math.abs(((e.st[key] >> sh) & 255) - ((o.st[key] >> sh) & 255)) > TOL.chan) fail(`frame ${k} ${key} channel`);
  });
  // drawing order of events that surely overlap (centres closer than NEAR px, same layer)
  for (let i = 0; i < x.length; i++) for (let j = i + 1; j < x.length; j++) {
    const p = x[i].pos, q = x[j].pos;
    if (x[i].layer !== x[j].layer || !p || !q || Math.hypot(p[0] - q[0], p[1] - q[1]) > NEAR) continue;
    pairs++;
    if ((match[i] < match[j]) !== true && match[i] >= 0 && match[j] >= 0 && y[match[i]].i > y[match[j]].i) fail(`frame ${k}: drawing order of ${x[i].key} / ${x[j].key} changed`);
  }
}
console.log(`${fileB}: ${nFrames} random frames, ${checked.toLocaleString('en-US')} events compared, ${pairs} overlapping pairs checked for drawing order, mode ${mode}: ${problems === 0 ? 'ALL MATCH' : `${problems} MISMATCHES`}`);
process.exitCode = problems === 0 ? 0 : 1;
