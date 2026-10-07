// Frame-gap stutter under weak-device conditions, one run = one JSON line. Same harness for any dist (compare two builds with --dist).
//   node tools/bench/stutter.mjs --par x.par | --ass x.ass  --from 7 --to 10.5 [--dist dist] [--lead 0]
//        [--throttle 4]   CDP Emulation.setCPUThrottlingRate (main thread of the page)
//        [--cores 2]      navigator.hardwareConcurrency override (init script; sizes the sprite worker pool)
//        [--workers off]  block the Worker constructor for blob: and data: URLs (the inlined sprite worker and Vite's data: fallback for it) so the pool fails and the main thread builds; the source Worker is untouched
//        [--cold]         no pre-roll: start the clock at --from right after create (nothing built, nothing decoded yet)
//        [--seek-from 40 --seek-to 8.8 --len 3]  play from --seek-from for --pre s, then jump the clock to --seek-to and measure --len s
// The clock is free-running (like burst.mjs); a gap is the time between two requestAnimationFrame callbacks.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from './pw.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };
const has = (k) => process.argv.includes('--' + k);
const dist = path.resolve(arg('dist', 'dist')), par = arg('par', ''), ass = arg('ass', '');
const from = +arg('from', 7), to = +arg('to', 10.5), fps = +arg('fps', 24), throttle = +arg('throttle', 1), cores = +arg('cores', 0), workers = arg('workers', 'on');
const cold = has('cold'), seekFrom = arg('seek-from', ''), seekTo = +arg('seek-to', 0), len = +arg('len', 3), pre = +arg('pre', 1.5);
const W = 1280, H = 720;
const srcFile = par ? path.resolve(par) : path.resolve(ass);
const srv = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(`<body style="margin:0;background:#445"><div id="c" style="position:relative;width:${W}px;height:${H}px;background:#445;overflow:hidden"></div></body>`); }
  const f = u === '/file' ? srcFile : path.join(dist, u.slice(1));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu-vsync'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.addInitScript(({ cores, workers }) => {
  if (cores) Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => cores, configurable: true });
  if (workers === 'off') { const W0 = window.Worker; window.Worker = function (url, o) { if (/^(blob|data):/.test(String(url))) throw new Error('blocked by bench'); return new W0(url, o); }; window.Worker.prototype = W0.prototype; }
  window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
}, { cores, workers });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${srv.address().port}/`);
if (throttle > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
const r = await page.evaluate(async ({ from, to, fps, isPar, cold, seekFrom, seekTo, len, pre }) => {
  const { create } = await import('/par.js');
  let subtitle;
  if (isPar) { const { openSourceInWorker } = await import('/source.js'); subtitle = await openSourceInWorker(await (await fetch('/file')).blob(), { worker: () => new Worker('/source.worker.js', { type: 'module' }), kind: 'par' }); }
  else subtitle = await (await fetch('/file')).text();
  const start = seekFrom === '' ? from : +seekFrom;
  window.clockT = start;
  const p = create({ container: document.getElementById('c'), subtitle, region: 'container', fps: 'auto', videoFps: fps, clock: () => window.clockT });
  await p.ready;
  if (!cold) {
    p.renderAt(start);
    for (let i = 0; i < 200 && isPar; i++) { const w = p.getSourceStats().windowRange; if (w && w[0] <= start && w[1] > start + 3) break; await new Promise((r) => setTimeout(r, 50)); p.renderAt(start); }
    await new Promise((r) => setTimeout(r, 300));
  }
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const s0 = performance.now(); let base = s0, t0 = start;
  p.setOptions({ clock: () => t0 + (performance.now() - base) / 1000 });
  const now = () => t0 + (performance.now() - base) / 1000;
  const rows = []; let last = s0, prevM = null, seeked = seekFrom === '', ltMark = window.__lt.length, m0 = p.getMetrics().render, mark = { rows: 0, lt: 0, m: m0 };
  const endT = seekFrom === '' ? to : Infinity; let seekAt = 0;
  while (seekFrom === '' ? now() < endT : (!seeked || performance.now() - seekAt < len * 1000)) {
    if (!seeked && now() >= start + pre) { seeked = true; seekAt = performance.now(); t0 = seekTo; base = seekAt; mark = { rows: rows.length, lt: window.__lt.length, m: p.getMetrics().render }; }
    await raf(); const n = performance.now(); const m = p.getMetrics(); const x = m.render;
    rows.push({ t: now(), gap: n - last, act: m.activeLines, drawn: x.drawn, shed: x.shed, q: x.planQueued, miss: x.spriteMisses, lead: x.planLeadMs }); last = n; prevM = x;
  }
  return { rows: rows.slice(mark.rows), lt: window.__lt.slice(mark.lt), m0: mark.m, m1: prevM, cores: navigator.hardwareConcurrency };
}, { from, to, fps, isPar: !!par, cold, seekFrom, seekTo, len, pre });
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const gaps = r.rows.map((x) => x.gap), f = (v) => +v.toFixed(1), d = (k) => (r.m1[k] ?? 0) - (r.m0[k] ?? 0);
const peak = r.rows.reduce((b, x) => (x.act > b.act ? x : b), r.rows[0]);
console.log(JSON.stringify({
  frames: gaps.length, p50: f(q(gaps, .5)), p95: f(q(gaps, .95)), p99: f(q(gaps, .99)), max: f(Math.max(...gaps)),
  o33: gaps.filter((g) => g > 33).length, o50: gaps.filter((g) => g > 50).length, o100: gaps.filter((g) => g > 100).length,
  lt: r.lt.length, ltSum: Math.round(r.lt.reduce((a, b) => a + b, 0)), ltMax: Math.round(Math.max(0, ...r.lt)),
  miss: d('spriteMisses'), deferred: d('skipped'), drop: d('detailDropped'), prewarmed: d('prewarmed'),
  drawnMax: Math.max(...r.rows.map((x) => x.drawn)), shedMax: Math.max(...r.rows.map((x) => x.shed)), shedFrames: r.rows.filter((x) => x.shed > 0).length,
  workers: r.m1.workers ?? null, workerBuilt: r.m1.workerBuilt ?? null, qMax: Math.max(...r.rows.map((x) => x.q ?? 0)), qEnd: r.m1.planQueued ?? null, peakActive: peak.act, cores: r.cores, errs: errs.length,
}));
await browser.close(); srv.close();
