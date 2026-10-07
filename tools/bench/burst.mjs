// Play into a burst (no seek into it): how many items were deferred / left out, and how long frames took around it.
// node tools/bench/burst.mjs --par x.par [--dist dist] [--from 7 --to 10.5] [--fps 24]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };
const dist = path.resolve(arg('dist', 'dist')), par = path.resolve(arg('par', ''));
const from = +arg('from', 7), to = +arg('to', 10.5), fps = +arg('fps', 24), mode = arg('mode', 'auto-default');
const W = +arg('w', 1280), H = +arg('h', 720);
const srv = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(`<body style="margin:0;background:#445"><div id="c" style="position:relative;width:${W}px;height:${H}px;background:#445;overflow:hidden"></div></body>`); }
  const f = u === '/file.par' ? par : path.join(dist, u.slice(1));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-lcd-text', '--font-render-hinting=none', '--disable-gpu-vsync'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.error('PAGEERR', e.message));
await page.goto(`http://localhost:${srv.address().port}/`);
const r = await page.evaluate(async ({ from, to, fps, mode }) => {
  const { create } = await import('/par.js');
  const { openSourceInWorker } = await import('/source.js');
  const blob = await (await fetch('/file.par')).blob();
  const src = await openSourceInWorker(blob, { worker: () => new Worker('/source.worker.js', { type: 'module' }), kind: 'par' });
  window.clockT = from;
  const opts = { container: document.getElementById('c'), subtitle: src, region: 'container', fps: 'auto', videoFps: fps, clock: () => window.clockT };
  if (mode !== 'auto-default') opts.renderMode = mode;
  const p = create(opts);
  await p.ready;
  p.renderAt(from);
  for (let i = 0; i < 200; i++) { const w = p.getSourceStats().windowRange; if (w && w[0] <= from && w[1] > from + 3) break; await new Promise((r) => setTimeout(r, 50)); p.renderAt(from); }
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const s0 = performance.now();
  p.setOptions({ clock: () => from + (performance.now() - s0) / 1000 });
  const rows = []; let last = s0, prev = p.getMetrics().render;
  while (from + (performance.now() - s0) / 1000 < to) {
    await raf(); const now = performance.now(); const m = p.getMetrics(); const x = m.render;
    rows.push({ t: from + (now - s0) / 1000, gap: now - last, act: m.activeLines, drawn: x.drawn, dSkip: x.skipped - prev.skipped, dDrop: x.detailDropped - prev.detailDropped, dMiss: x.spriteMisses - prev.spriteMisses, dWarm: x.prewarmed - prev.prewarmed });
    last = now; prev = x;
  }
  return rows;
}, { from, to, fps, mode });
if (process.argv.includes('--rows')) for (const x of r) if (x.dMiss > 8 || x.dSkip > 0 || x.gap > 45) console.log(`  t=${x.t.toFixed(2)} gap=${x.gap.toFixed(0)} act=${x.act} drawn=${x.drawn} miss=${x.dMiss} skip=${x.dSkip} warm=${x.dWarm}`);
const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const gaps = r.map((x) => x.gap);
const peak = r.reduce((b, x) => (x.act > b.act ? x : b), r[0]);
const skipFrames = r.filter((x) => x.dSkip > 0);
console.log(JSON.stringify({
  from, to, frames: r.length, gapP50: +q(gaps, .5).toFixed(1), gapP95: +q(gaps, .95).toFixed(1), gapP99: +q(gaps, .99).toFixed(1), gapMax: +Math.max(...gaps).toFixed(1),
  over50: gaps.filter((g) => g > 50).length, over100: gaps.filter((g) => g > 100).length,
  peakActive: peak.act, peakAt: +peak.t.toFixed(2), skippedTotal: r.reduce((a, x) => a + x.dSkip, 0), framesWithSkips: skipFrames.length,
  worstSkip: Math.max(0, ...r.map((x) => x.dSkip)), droppedBlurTotal: r.reduce((a, x) => a + x.dDrop, 0), missTotal: r.reduce((a, x) => a + x.dMiss, 0), warmTotal: r.reduce((a, x) => a + x.dWarm, 0),
}));
await browser.close(); srv.close();
