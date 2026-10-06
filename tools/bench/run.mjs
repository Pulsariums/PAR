// Source decoding runs in a Worker like the product does (--main-thread to decode on the page thread).
// Heavy-scene benchmark: node tools/bench/run.mjs --par x.par [--dist dist] [--times 9.04,5.92] [--frames 96] [--fps 24] [--mode auto|dom|canvas] [--play 5] [--trace]
// Needs Playwright (NODE_PATH or /opt/node22/lib/node_modules) + a Chromium; software rendering is fine, compare relative gains.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };
const dist = path.resolve(arg('dist', 'dist'));
const parFile = path.resolve(arg('par', ''));
const times = String(arg('times', '9.04,5.92,52.6')).split(',').map(Number);
const frames = +arg('frames', 96), fps = +arg('fps', 24), play = +arg('play', 0), mode = arg('mode', 'auto');
const trace = process.argv.includes('--trace'), profFile = arg('prof', '');
const W = +arg('w', 1280), H = +arg('h', 720);
const srv = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<body style="margin:0;background:#445"><div id="c" style="position:relative;width:' + W + 'px;height:' + H + 'px;background:#445;overflow:hidden"></div></body>'); }
  const f = u === '/file.par' ? parFile : path.join(dist, u.slice(1));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu-vsync'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.error('PAGEERR', e.message));
await page.goto(`http://localhost:${srv.address().port}/?cache=${arg('cache', '')}`);
await page.evaluate(async ({ mode, fps, useWorker }) => {
  const { create } = await import('/par.js');
  const { fromPar, openSourceInWorker } = await import('/source.js');
  const blob = await (await fetch('/file.par')).blob();
  const src = useWorker ? await openSourceInWorker(blob, { worker: () => new Worker('/source.worker.js', { type: 'module' }), kind: 'par' }) : await fromPar(blob);
  window.clockT = 0;
  const opts = { container: document.getElementById('c'), subtitle: src, region: 'container', fps: 'auto', videoFps: fps, clock: () => window.clockT };
  if (mode !== 'auto-default') opts.renderMode = mode;
  const cmb = +new URLSearchParams(location.search).get('cache'); if (cmb) opts.spriteCacheMB = cmb;
  window.par = create(opts);
  await window.par.ready;
  window.raf = () => new Promise((r) => requestAnimationFrame(r));
}, { mode, fps, useWorker: !process.argv.includes('--main-thread') });
const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const out = [];
for (const t0 of times) {
  await page.evaluate(async (t0) => {
    window.clockT = t0; window.par.renderAt(t0);
    for (let i = 0; i < 200; i++) { const r = window.par.getSourceStats().windowRange; if (r && r[0] <= t0 && r[1] > t0 + 1.5) break; await new Promise((r) => setTimeout(r, 50)); window.par.renderAt(t0); }
  }, t0);
  const pcdp = profFile ? await page.context().newCDPSession(page) : null;
  if (pcdp) { await pcdp.send('Profiler.enable'); await pcdp.send('Profiler.setSamplingInterval', { interval: 200 }); await pcdp.send('Profiler.start'); }
  const cdp = trace ? await page.context().newCDPSession(page) : null;
  const events = [];
  if (cdp) { cdp.on('Tracing.dataCollected', (d) => events.push(...d.value)); await cdp.send('Tracing.start', { categories: process.env.CATS || 'devtools.timeline,disabled-by-default-devtools.timeline,gpu,cc', transferMode: 'ReportEvents' }); }
  const r = await page.evaluate(async ({ t0, frames, fps, play }) => {
    const sync = [], total = [], act = [];
    for (let i = 0; i < frames; i++) {
      const a = performance.now(); const t = t0 + i / fps;
      window.clockT = t; window.par.renderAt(t);
      const b = performance.now(); await window.raf(); await window.raf();
      act.push(window.par.getMetrics().activeLines); sync.push(b - a); total.push(performance.now() - a);
    }
    const m = window.par.getMetrics();
    let gaps = [], n = 0;
    if (play > 0) {
      const s = performance.now(); let last = s; window.clockT = t0; const base = s;
      window.par.setOptions({ clock: () => t0 + (performance.now() - base) / 1000 });
      while (performance.now() - s < play * 1000) { await window.raf(); const now = performance.now(); gaps.push(now - last); last = now; n++; }
      window.par.setOptions({ clock: () => window.clockT });
    }
    return { sync, total, gaps, n, active: act, metrics: m };
  }, { t0, frames, fps, play });
  if (pcdp) { const { profile } = await pcdp.send('Profiler.stop'); fs.writeFileSync(profFile, JSON.stringify(profile)); }
  let breakdown = null;
  if (cdp) {
    await cdp.send('Tracing.end'); await new Promise((res) => cdp.once('Tracing.tracingComplete', res));
    const names = new Map(); events.filter((e) => e.name === 'thread_name').forEach((e) => names.set(e.pid + ':' + e.tid, e.args.name));
    const by = {};
    const xs = events.filter((e) => e.ph === 'X' && e.dur).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    const stacks = new Map();
    for (const e of xs) {
      const k = e.pid + ':' + e.tid; const tn = names.get(k) || k;
      const st = stacks.get(k) || []; stacks.set(k, st);
      while (st.length && st[st.length - 1].ts + st[st.length - 1].dur <= e.ts) st.pop();
      if (st.length) st[st.length - 1].self -= e.dur;
      e.self = e.dur; st.push(e);
    }
    for (const e of xs) { const tn = names.get(e.pid + ':' + e.tid) || 'other'; const key = tn.replace(/\d+$/, '') + '/' + e.name; by[key] = (by[key] || 0) + e.self / 1000 / frames; }
    breakdown = Object.entries(by).filter(([k, v]) => v > 0.3 && !/RunTask|ThreadControllerImpl/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k}=${v.toFixed(1)}`);
  }
  const rec = { t0, active: [r.active[0], Math.max(...r.active), r.active[r.active.length - 1]], syncMean: +(r.sync.reduce((a, b) => a + b, 0) / frames).toFixed(1), stepP50: +q(r.total, .5).toFixed(1), stepP95: +q(r.total, .95).toFixed(1), stepFps: +(1000 / (r.total.reduce((a, b) => a + b, 0) / frames)).toFixed(1) };
  if (play) Object.assign(rec, { playFps: +(r.n / play).toFixed(1), gapP95: +q(r.gaps, .95).toFixed(1) });
  const m = r.metrics.render ?? {}; rec.render = { dom: m.domLines, cv: m.canvasLines, runs: m.canvasRuns, sprites: m.sprites, MB: Math.round((m.spriteBytes || 0) / 1e6), hit: m.spriteHits, miss: m.spriteMisses, warm: m.prewarmed, drop: m.detailDropped, skip: m.skipped, ev: m.evictions, frameMs: m.frameMs }; rec.perFrameMsMainThread = breakdown;
  out.push(rec); console.log(JSON.stringify(rec));
}
await browser.close(); srv.close();
