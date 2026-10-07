// Runs stutter.mjs over a matrix (builds x conditions x scenarios x 3 runs), appends one JSON line per run to --out (resumable), prints medians.
// --heavy: the animate=1 stress script (C1 60 s, C4 20 s only)
// node tools/bench/stutter-matrix.mjs --base /tmp/base/dist --new /tmp/new/dist --e24 e24.par --synth karaoke60.ass --out results.jsonl [--runs 3] [--only C1,C2] [--report]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };
const base = arg('base'), nw = arg('new'), e24 = arg('e24'), synth = arg('synth'), heavy = arg('heavy', ''), out = arg('out', 'stutter.jsonl'), runs = +arg('runs', 3), only = String(arg('only', '')).split(',').filter(Boolean);
const here = new URL('./stutter.mjs', import.meta.url).pathname;
const conds = { C1: { throttle: 1, cores: 4 }, C2: { throttle: 4, cores: 4 }, C3: { throttle: 4, cores: 2 }, C4: { throttle: 6, cores: 2 }, C5: { throttle: 6, cores: 4 }, C6: { throttle: 1, cores: 2 } };
const variants = [['base', base, 'on'], ['new', nw, 'on'], ['new-off', nw, 'off']];
const E = ['--par', e24], S = ['--ass', synth];
const scen = (c) => [
  ['burst 7-10.5', [...E, '--from', 7, '--to', 10.5]], ['burst 50-54', [...E, '--from', 50, '--to', 54]], ['burst 22.6-25', [...E, '--from', 22.6, '--to', 25]],
  c === 'C1' ? ['synth 60s', [...S, '--from', 0, '--to', 60]] : ['synth 14-34', [...S, '--from', 14, '--to', 34]],
  ...(heavy && c === 'C1' ? [['heavy 60s', ['--ass', heavy, '--from', 0, '--to', 60]]] : []), ...(heavy && c === 'C4' ? [['heavy 14-34', ['--ass', heavy, '--from', 14, '--to', 34]]] : []),
  ['cold e24 8.2', [...E, '--cold', '--from', 8.2, '--to', 11.5]], ['cold synth 0', [...S, '--cold', '--from', 0, '--to', 7]],
  ['seek e24 ->8.7', [...E, '--seek-from', 40, '--seek-to', 8.7, '--len', 3]], ['seek e24 ->52.3', [...E, '--seek-from', 40, '--seek-to', 52.3, '--len', 3]],
  ['seek synth ->31.7', [...S, '--seek-from', 14, '--seek-to', 31.7, '--len', 3]], ['seek synth ->32.3', [...S, '--seek-from', 14, '--seek-to', 32.3, '--len', 3]],
];
const done = new Set(fs.existsSync(out) ? fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => { const j = JSON.parse(l); return `${j.cond}|${j.scen}|${j.variant}|${j.run}`; }) : []);
if (!process.argv.includes('--report')) for (const [c, cfg] of Object.entries(conds)) {
  if (only.length && !only.includes(c)) continue;
  for (const [sn, a] of scen(c)) for (const [vn, dist, w] of variants) for (let r = 1; r <= runs; r++) {
    // c6 / c3 / c4 / c5 only need the build comparison on a subset: every scenario still runs, it is cheap next to the synthetic
    const key = `${c}|${sn}|${vn}|${r}`; if (done.has(key)) continue;
    const p = spawnSync('node', [here, '--dist', dist, ...a, '--throttle', cfg.throttle, '--cores', cfg.cores, '--workers', w].map(String), { encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] });
    const line = p.stdout.trim().split('\n').pop();
    try { fs.appendFileSync(out, JSON.stringify({ cond: c, ...cfg, scen: sn, variant: vn, run: r, ...JSON.parse(line) }) + '\n'); console.log(key, 'ok'); } catch { console.log(key, 'FAILED', (p.stderr || '').slice(0, 200)); }
  }
}
const rows = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const groups = new Map(); for (const r of rows) { const k = `${r.cond}|${r.scen}|${r.variant}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(r); }
const F = ['p50', 'p95', 'p99', 'max', 'o33', 'o50', 'o100', 'lt', 'ltMax', 'miss', 'deferred', 'drop', 'drawnMax', 'shedFrames', 'workers', 'workerBuilt', 'qMax', 'qEnd'];
console.log('| cond | scenario | build | n | ' + F.join(' | ') + ' | worst max |'); console.log('|' + '---|'.repeat(F.length + 5));
for (const [k, g] of groups) { const [c, s, v] = k.split('|'); console.log(`| ${c} | ${s} | ${v} | ${g.length} | ${F.map((f) => med(g.map((r) => r[f]))).join(' | ')} | ${Math.max(...g.map((r) => r.max))} |`); }
