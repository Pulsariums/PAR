// Zero-stutter bench: frame gaps, items missing / reduced, cold start, seek into a burst, memory. One JSON line per run.
//   node tools/bench/zs-stutter.mjs --dist dist [--ass x.ass] [--scenario play,seek,pseek] [--throttle 1,4,6] [--cores 4,2]
//        [--len 60] [--warm 8] [--open-wait 0] [--seek-from 24 --seek-to 34.04 --pre 2 --seek-len 3] [--profile] [--label name]
// Headless Chromium, software rendering: only relative numbers mean anything. Without --ass the synthetic report script is used
// (a burst of 1100 blurred per-glyph particles every 2 s for 60 s, quiet part 22-32 s). Throttle = CDP Emulation.setCPUThrottlingRate of the
// page's main thread (workers are not throttled by it: the cores number sizes the sprite pool through navigator.hardwareConcurrency).
// Scenarios: play = open + play from 0 on a free-running clock (cold start included, `warm` s are excluded from the "warm" numbers);
// seek = play, then jump the clock into a burst; pseek = paused jump into a burst (time until the frame is complete).
// "missing" is counted per frame as canvas lines on screen that were neither drawn nor shed (builds the frame did not wait for).
import fs from 'node:fs';
import path from 'node:path';
import { arg, chromium, CHROME, gapStats, has, H, serve, synth, topSelf, W } from './zs-lib.mjs';

const dist = path.resolve(arg('dist', 'dist')), label = arg('label', path.basename(path.dirname(dist)) || 'dist');
const list = (k, d) => String(arg(k, d)).split(',').map((x) => (isNaN(+x) ? x : +x));
const scenarios = list('scenario', 'play'), throttles = list('throttle', '1'), coresL = list('cores', '4');
const len = +arg('len', 60), warm = +arg('warm', 8), openWait = +arg('open-wait', 0), fps = +arg('fps', 24);
const videoFile = arg('video', '') ? path.resolve(arg('video', '')) : '';
const seekFrom = +arg('seek-from', 24), seekTo = +arg('seek-to', 34.04), pre = +arg('pre', 2), seekLen = +arg('seek-len', 3);
const file = arg('ass', '') ? path.resolve(arg('ass', '')) : path.join(process.env.TMPDIR || '/tmp', `zs-synth-${process.pid}.ass`);
if (!arg('ass', '')) fs.writeFileSync(file, synth({ seconds: Math.max(60, len) }));

const workersOff = arg('workers', 'on') === 'off';
const one = async (scenario, throttle, cores) => {
  const srv = serve(dist, file, videoFile);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu-vsync'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(({ cores, workersOff }) => {
    if (workersOff) { const W0 = window.Worker; window.Worker = function (url, o) { if (/^(blob|data):/.test(String(url))) throw new Error('blocked by bench'); return new W0(url, o); }; window.Worker.prototype = W0.prototype; }
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => cores, configurable: true });
    window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__lt.push(e.duration); (window.__ltAt ??= []).push([Math.round(e.startTime), Math.round(e.duration)]); } }).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
  }, { cores, workersOff });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${srv.address().port}/`);
  const cdp = await ctx.newCDPSession(page);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const t0 = Date.now();
  if (has('profile')) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  const r = await page.evaluate(async ({ scenario, fps, len, openWait, seekFrom, seekTo, pre, seekLen, useVideo }) => {
    const { create } = await import('/par.js');
    const text = await (await fetch('/file')).text();
    const start = scenario === 'play' ? 0 : seekFrom;
    window.clockT = start;
    let vid = null;
    if (useVideo) { vid = document.createElement('video'); vid.muted = true; vid.src = '/video'; vid.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%'; document.getElementById('c').prepend(vid); await new Promise((r) => { vid.onloadeddata = r; vid.load(); }); vid.currentTime = start; }
    const p = create(useVideo ? { container: document.getElementById('c'), video: vid, subtitle: text, region: 'container', fps: 'auto', videoFps: fps } : { container: document.getElementById('c'), subtitle: text, region: 'container', fps: 'auto', videoFps: fps, clock: () => window.clockT });
    await p.ready;
    p.renderAt(start);
    if (openWait > 0) await new Promise((r) => setTimeout(r, openWait * 1000));
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const rm = () => p.getMetrics().render;
    let base = performance.now(), t0 = start;
    let now = () => t0 + (performance.now() - base) / 1000;
    const paused = scenario === 'pseek';
    if (useVideo) { now = () => vid.currentTime; await vid.play(); } else if (!paused) p.setOptions({ clock: () => now() });
    const rows = []; const lt0 = window.__lt.length;
    window.__play0 = performance.now();
    let start2 = start;
    let last = performance.now(), seeked = scenario === 'play', seekAt = 0, settle = null, mark = 0, m0 = rm(), mseek = m0;
    const end = scenario === 'play' ? len : pre + seekLen;
    const wallEnd = performance.now() + (end + 60) * 1000;
    const spent = () => (useVideo ? (seeked && scenario === 'seek' ? pre + vid.currentTime - seekTo : vid.currentTime - start) : (performance.now() - base) / 1000);
    if (paused) {
      // paused: jump and measure the time until a complete frame is on screen
      const s = performance.now(); p.renderAt(seekTo);
      for (let i = 0; i < 400; i++) { await raf(); const x = rm(); const miss = x.canvasLines - x.drawn - x.shed; rows.push({ t: seekTo, gap: 0, miss, vis: x.canvasLines, dr: x.drawn }); if (x.canvasLines >= 900 && miss <= 0) { settle = performance.now() - s; break; } }
      return { rows, lt: window.__lt.slice(lt0), m0, m1: rm(), settle, heap: performance.memory?.usedJSHeapSize ?? 0 };
    }
    while (spent() < end && performance.now() < wallEnd) {
      if (!seeked && now() >= start + pre) { seeked = true; seekAt = performance.now(); t0 = seekTo; base = seekAt; mark = rows.length; mseek = rm(); if (useVideo) { vid.currentTime = seekTo; start2 = seekTo; } }
      await raf();
      const n = performance.now(), x = rm(), miss = Math.max(0, x.canvasLines - x.drawn - x.shed);
      rows.push({ t: now(), gap: n - last, miss, vis: x.canvasLines, dr: x.drawn, sp: x.spriteBytes, det: x.detailDropped, hold: x.heldMs ?? 0 }); last = n;
      if (seeked && scenario === 'seek' && settle === null && x.canvasLines >= 900 && miss <= 0) settle = n - seekAt;
    }
    return { rows: scenario === 'seek' ? rows.slice(mark) : rows, lt: window.__lt.slice(lt0), m0: scenario === 'seek' ? mseek : m0, m1: rm(), settle, heap: performance.memory?.usedJSHeapSize ?? 0, ltAt: (window.__ltAt ?? []).map(([a, d]) => [Math.round(a - window.__play0), d]) };
  }, { scenario, fps, len, openWait, seekFrom, seekTo, pre, seekLen, useVideo: !!videoFile });
  const wall = Date.now() - t0;
  const prof = has('profile') ? topSelf((await cdp.send('Profiler.stop')).profile) : undefined;
  const gaps = r.rows.map((x) => x.gap).filter((_, i) => scenario !== 'pseek'), wr = r.rows.filter((x) => x.t >= warm || scenario !== 'play');
  const d = (k) => (r.m1[k] ?? 0) - (r.m0[k] ?? 0);
  const miss = (rows) => ({ frames: rows.filter((x) => x.miss > 0).length, items: rows.reduce((a, x) => a + x.miss, 0), peak: Math.max(0, ...rows.map((x) => x.miss)) });
  const out = {
    label, scenario, throttle, cores, workers: workersOff ? 'off' : 'on', wallS: Math.round(wall / 1000), all: gaps.length ? gapStats(gaps) : null, warm: scenario === 'play' ? gapStats(wr.map((x) => x.gap)) : undefined,
    missAll: miss(r.rows), missWarm: scenario === 'play' ? miss(wr) : undefined, reduced: d('detailDropped'), misses: d('spriteMisses'), prewarmed: d('prewarmed'),
    settleMs: r.settle === null ? null : Math.round(r.settle), longtasks: r.lt.length, ltMax: Math.round(Math.max(0, ...r.lt)), ltSum: Math.round(r.lt.reduce((a, b) => a + b, 0)),
    heapMB: Math.round(r.heap / 1048576), spriteMBmax: Math.round(Math.max(0, ...r.rows.map((x) => x.sp ?? 0)) / 1048576), workers: r.m1.workers ?? null, errs: errs.length,
    slow: has('slow') ? r.rows.filter((x) => x.gap > 100).map((x) => [+x.t.toFixed(2), Math.round(x.gap), x.vis, x.dr, x.miss]) : undefined,
    prof, ltAt: has('lt') ? r.ltAt.filter((x) => x[0] > 0) : undefined,
    extra: Object.fromEntries(['missing', 'missedTotal', 'held', 'stalls', 'stallMs'].filter((k) => k in r.m1).map((k) => [k, r.m1[k]])),
  };
  await browser.close(); srv.close();
  return out;
};

for (const sc of scenarios) for (const th of throttles) for (const c of coresL) console.log(JSON.stringify(await one(sc, th, c)));
if (!arg('ass', '')) fs.rmSync(file, { force: true });
