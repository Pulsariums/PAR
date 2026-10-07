// Seek-storm check: node tools/bench/seek.mjs --par x.par [--dist dist] [--n 30] [--gap 50] [--fps 24] [--mode auto]
// Fires N random seeks `gap` ms apart on a clock-driven renderer, then plays; reports console errors, stuck/ghost lines,
// seek latency (seek -> the shown set equals direct evaluation), long tasks and heap growth.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from './pw.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };
const dist = path.resolve(arg('dist', 'dist')), parFile = path.resolve(arg('par', ''));
const N = +arg('n', 30), gap = +arg('gap', 50), fps = +arg('fps', 24), mode = arg('mode', 'auto-default'), useWorker = process.argv.includes('--worker'), rounds = +arg('rounds', 3);
const srv = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<body style="margin:0;background:#445"><div id="c" style="position:relative;width:1280px;height:720px;overflow:hidden"></div></body>'); }
  const f = u === '/file.par' ? parFile : path.join(dist, u.slice(1));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-lcd-text'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 160)); });
await page.goto(`http://localhost:${srv.address().port}/`);
const res = await page.evaluate(async ({ N, gap, fps, mode, rounds, useWorker }) => {
  const P = await import('/par.js'); const { fromPar, openSourceInWorker } = await import('/source.js');
  const blob = await (await fetch('/file.par')).blob();
  const src = useWorker ? await openSourceInWorker(blob, { worker: () => new Worker('/source.worker.js', { type: 'module' }), kind: 'par' }) : await fromPar(blob);
  const ref = await fromPar(blob);
  let clockT = 0;
  const opts = { container: document.getElementById('c'), subtitle: src, region: 'container', fps: 'auto', videoFps: fps, clock: () => clockT };
  if (mode !== 'auto-default') opts.renderMode = mode;
  const par = P.create(opts); await par.ready;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lt = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => lt.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch {}
  const domIds = () => [...document.querySelectorAll('.par-line')].map((e) => e.dataset.parId).sort().join('|');
  const matches = (want) => { const w = want ? want.split('|') : []; return domIds().split('|').filter(Boolean).every((id) => w.includes(id)) && par.getMetrics().render.domLines + par.getMetrics().render.canvasLines === w.length; };
  const expected = async (t) => {
    const ms = P.timeToMs(t, fps); const ev = await ref.readWindow(ms / 1000 - 0.5, ms / 1000 + 0.5);
    return ev.filter((e) => P.msOf(e.start) <= ms && ms < P.msOf(e.end)).map((e) => e.id).sort().join('|');
  };
  const dur = src.duration, lat = [], bad = []; let wrongFinal = 0;
  const heap0 = performance.memory?.usedJSHeapSize ?? 0; const heaps = [];
  for (let r = 0; r < rounds; r++) {
    const tg = [9.04, 5.92, 52.6, 23.4, 600.1, 1300.5];
    let wantLast = ''; for (let i = 0; i < N; i++) { const tt = i % 3 === 0 ? tg[(i + r) % tg.length] + Math.random() * 3 : Math.random() * dur; if (i === N - 1) wantLast = await expected(tt); clockT = tt; await sleep(gap); }
    const t = clockT, want = wantLast; let ok = false; const s0 = performance.now();
    while (performance.now() - s0 < 8000) { if (matches(want)) { ok = true; break; } await sleep(10); }
    if (ok) lat.push(performance.now() - s0); else { wrongFinal++; bad.push({ t, shown: par.getMetrics().activeLines, want: want.split('|').length }); }
    heaps.push(performance.memory?.usedJSHeapSize ?? 0);
  }
  // single seeks (isolated latency), including paused (no rAF difference with clock) behaviour via renderAt
  const single = [];
  for (const t of [9.04, 300.2, 5.92, 1000.1, 52.6, 12.3, 700.7, 23.4]) {
    const want = await expected(t); clockT = t; const s0 = performance.now(); let ok = false;
    while (performance.now() - s0 < 8000) { if (matches(want)) { ok = true; break; } await sleep(5); }
    single.push(ok ? Math.round(performance.now() - s0) : -1);
  }
  // playback phase check: play 3 s from 9.04 and compare at end
  const base = performance.now(); par.setOptions({ clock: () => 9.04 + (performance.now() - base) / 1000 }); await sleep(3000);
  const tEnd = 9.04 + (performance.now() - base) / 1000; const stats = par.getSourceStats();
  return { lat, wrongFinal, bad, single, longTasks: lt.length, longTaskMax: Math.round(Math.max(0, ...lt)), heapMB: [heap0, ...heaps].map((h) => Math.round(h / 1e6)), stats, lines: par.getMetrics().activeLines };
}, { N, gap, fps, mode, rounds, useWorker });
const q = (a, p) => a.length ? Math.round(a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]) : null;
console.log(JSON.stringify({ errors: [...new Set(errs)].slice(0, 6), finalLatencyMsP50: q(res.lat, .5), finalLatencyMsP95: q(res.lat, .95), wrongFinal: res.wrongFinal, bad: res.bad, singleSeekMs: res.single, longTasks: res.longTasks, longTaskMax: res.longTaskMax, heapMB: res.heapMB, stats: res.stats, lines: res.lines }));
await browser.close(); srv.close();
