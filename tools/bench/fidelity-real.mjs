// DOM vs canvas on a real file at chosen times: node tools/bench/fidelity-real.mjs --par x.par [--times 9.3,23.6] [--save dir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from './pw.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };
const dist = path.resolve(arg('dist', 'dist')), parFile = path.resolve(arg('par', ''));
const times = String(arg('times', '9.3,23.6,52.9,5.97,700.3')).split(',').map(Number), save = arg('save', '');
const W = 960, H = 540;
const bg = 'background:repeating-conic-gradient(#556 0% 25%,#889 0% 50%) 0 0/40px 40px';
const srv = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(`<body style="margin:0"><div id="a" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;${bg}"></div><div id="b" style="position:absolute;left:0;top:${H + 20}px;width:${W}px;height:${H}px;overflow:hidden;${bg}"></div></body>`); }
  const f = u === '/file.par' ? parFile : path.join(dist, u.slice(1));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-lcd-text', '--font-render-hinting=none'] });
const page = await (await browser.newContext({ viewport: { width: W + 20, height: 2 * H + 40 }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.error('PAGEERR', e.message));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.evaluate(async () => {
  const P = await import('/par.js'); const S = await import('/source.js');
  const blob = await (await fetch('/file.par')).blob();
  const mk = async (id, renderMode) => { const p = P.create({ container: document.getElementById(id), subtitle: await S.fromPar(blob), region: 'container', renderMode, videoFps: 24 }); await p.ready; return p; };
  window.pa = await mk('a', 'dom'); window.pb = await mk('b', 'canvas');
});
for (const t of times) {
  await page.evaluate(async (t) => { for (let i = 0; i < 80; i++) { window.pa.renderAt(t); window.pb.renderAt(t); const a = window.pa.getSourceStats().windowRange, b = window.pb.getSourceStats().windowRange; if (a && b && a[0] <= t && a[1] > t + 0.4 && b[0] <= t && b[1] > t + 0.4) break; await new Promise((r) => setTimeout(r, 100)); } await new Promise((r) => setTimeout(r, 300)); let last = -1, same = 0; for (let i = 0; i < 200 && same < 4; i++) { window.pa.renderAt(t); window.pb.renderAt(t); const r = window.pb.getMetrics().render; const k = r.skipped + r.sprites; same = k === last ? same + 1 : 0; last = k; await new Promise((r) => setTimeout(r, 30)); } await new Promise((r) => setTimeout(r, 600)); }, t);
  const ca = await page.locator('#a').screenshot(), cb = await page.locator('#b').screenshot();
  await page.evaluate(() => { for (const id of ['a', 'b']) document.getElementById(id).firstElementChild.style.visibility = 'hidden'; document.querySelectorAll('.par-stage').forEach((e) => (e.style.visibility = 'hidden')); });
  const cz = await page.locator('#a').screenshot();
  await page.evaluate(() => document.querySelectorAll('.par-stage').forEach((e) => (e.style.visibility = 'visible')));
  if (save) { fs.mkdirSync(save, { recursive: true }); fs.writeFileSync(`${save}/real-${t}.dom.png`, ca); fs.writeFileSync(`${save}/real-${t}.cv.png`, cb); }
  const m = await page.evaluate(() => window.pb.getMetrics().render);
  const d = await page.evaluate(async ({ a, b, z }) => {
    const dec = async (s) => { const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob()); const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height).data; };
    const A = await dec(a), B = await dec(b), Z = await dec(z); let t = 0, m = 0, painted = 0, big = 0;
    for (let i = 0; i < A.length; i += 4) { let dd = 0; for (let k = 0; k < 3; k++) dd += Math.abs(A[i + k] - B[i + k]); dd /= 3; t += dd; if (dd > 24) big++; if (Math.abs(A[i] - Z[i]) + Math.abs(A[i + 1] - Z[i + 1]) + Math.abs(B[i] - Z[i]) + Math.abs(B[i + 1] - Z[i + 1]) > 6) { painted++; m += dd; } }
    return { mean: t / (A.length / 4), onPainted: m / Math.max(1, painted), painted, big };
  }, { a: ca.toString('base64'), b: cb.toString('base64'), z: cz.toString('base64') });
  console.log(`t=${t}`.padEnd(10), `mean=${d.mean.toFixed(3)} painted-px=${d.painted} mean-on-painted=${d.onPainted.toFixed(2)} px>24=${d.big} canvasLines=${m.canvasLines} dom=${m.domLines} runs=${m.canvasRuns}`);
}
await browser.close(); srv.close();
