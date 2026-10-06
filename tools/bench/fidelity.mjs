// DOM vs canvas pixel diff on particle fixtures: node tools/bench/fidelity.mjs --font LiberationSans-Regular.ttf [--dist dist] [--save dir]
// Mean absolute per-channel difference over the whole frame (the DOM-vs-DOM noise floor is ~0) and over the pixels either path painted.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };
const dist = path.resolve(arg('dist', 'dist')), fontFile = path.resolve(arg('font', ''));
const save = arg('save', '');
const HEAD = `[Script Info]\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 360\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Liberation Sans,44,&H00FFFFFF,&H0000FF00,&H00202020,&H80000000,0,0,0,0,100,100,0,0,1,0,0,5,10,10,10,1\nStyle: Sp,Liberation Sans,40,&H00FFFFFF,&H0000FF00,&H00202020,&H80000000,-1,0,0,0,100,100,1,0,1,0,0,5,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
const cases = {
  blur: (i) => `\\blur3\\c&HF1D00F&`, bord_blur: () => `\\bord3\\blur2\\3c&H0000FF&`, shadow: () => `\\shad4\\blur1\\bord2`,
  aniso: () => `\\fscx70\\fscy130\\blur2\\c&H3DE2F8&`, rot_move: (i, x, y) => `\\move(${x - 30},${y},${x + 30},${y + 10},0,3000)\\frz${25 + i * 20}\\blur1`,
  clip_rect: (i, x, y) => `\\clip(${x - 15},${y - 40},${x + 40},${y + 18})\\blur1`, clip_vec: (i, x, y) => `\\clip(m ${x - 20} ${y - 30} l ${x + 30} ${y - 20} ${x + 10} ${y + 25} ${x - 25} ${y + 15})`,
  fade: () => `\\fad(1500,0)\\bord2\\blur2`, translucent: () => `\\1a&H80&\\bord3\\blur1\\3c&HFF0000&`, alpha_blur: () => `\\1a&H40&\\blur4\\c&HDC4D00&`,
  trans: () => `\\blur1\\c&HF8E23D&\\t(0,2000,\\blur6\\c&H0000FF&\\fscx150\\fscy150\\frz90)`,  fs_small: () => `\\fs18\\blur2`, bord0blur5: () => `\\fs30\\blur5\\1a&H42&`,
};
const mk = (fn, st = 'Default', chunks = [...'Kara']) => HEAD + chunks.map((ch, i) => { const x = 90 + i * 150, y = 180; return `Dialogue: 0,0:00:00.00,0:00:05.00,${st},,0,0,0,,{\\an5\\pos(${x},${y})${fn(i, x, y)}}${ch}`; }).join('\n') + '\n';
const srv = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<body style="margin:0"><div id="a" style="position:absolute;left:0;top:0;width:640px;height:360px;overflow:hidden;background:repeating-conic-gradient(#556 0% 25%,#889 0% 50%) 0 0/40px 40px"></div><div id="b" style="position:absolute;left:0;top:380px;width:640px;height:360px;overflow:hidden;background:repeating-conic-gradient(#556 0% 25%,#889 0% 50%) 0 0/40px 40px"></div></body>'); }
  const f = u === '/font.ttf' ? fontFile : path.join(dist, u.slice(1));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-lcd-text', '--font-render-hinting=none'] });
const page = await (await browser.newContext({ viewport: { width: 660, height: 760 }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.error('PAGEERR', e.message));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.evaluate(async () => { window.P = await import('/par.js'); window.font = new Uint8Array(await (await fetch('/font.ttf')).arrayBuffer()); });
let sum = 0, n = 0;
cases.spaced = Object.assign(() => `\\blur2`, { style: 'Sp', chunks: ['Ka', 'raGo', 'Ji', 'Xy'] });
for (const [name, fn] of Object.entries(cases)) {
  const ass = mk(fn, fn.style, fn.chunks);
  const modes = await page.evaluate(async ({ ass }) => {
    document.getElementById('a').replaceChildren(); document.getElementById('b').replaceChildren();
    const mkp = (id, renderMode) => window.P.create({ container: document.getElementById(id), subtitle: ass, region: 'container', renderMode, fonts: [window.font.slice()] });
    const a = mkp('a', 'dom'), b = mkp('b', 'canvas');
    await Promise.all([a.ready, b.ready]);
    for (let i = 0; i < 3; i++) { a.renderAt(1); b.renderAt(1); await new Promise((r) => setTimeout(r, 150)); }
    return b.getMetrics().render;
  }, { ass });
  const ca = await page.locator('#a').screenshot(), cb = await page.locator('#b').screenshot();
  await page.evaluate(() => { for (const id of ['a', 'b']) document.getElementById(id).firstElementChild.style.visibility = 'hidden'; });
  const cz = await page.locator('#a').screenshot();
  if (save) { fs.mkdirSync(save, { recursive: true }); fs.writeFileSync(`${save}/${name}.dom.png`, ca); fs.writeFileSync(`${save}/${name}.cv.png`, cb); }
  const d = await page.evaluate(async ({ a, b, z }) => {
    const dec = async (s) => { const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob()); const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height).data; };
    const A = await dec(a), B = await dec(b), Z = await dec(z); let t = 0, m = 0, cnt = 0, mx = 0, painted = 0;
    for (let i = 0; i < A.length; i += 4) { let dd = 0; for (let k = 0; k < 3; k++) dd += Math.abs(A[i + k] - B[i + k]); dd /= 3; t += dd; if (Math.abs(A[i] - Z[i]) + Math.abs(A[i + 1] - Z[i + 1]) + Math.abs(B[i] - Z[i]) + Math.abs(B[i + 1] - Z[i + 1]) > 6) { painted++; m += dd; } if (dd > 12) cnt++; if (dd > mx) mx = dd; }
    return { mean: t / (A.length / 4), onPainted: m / Math.max(1, painted), bigPx: cnt, max: Math.round(mx) };
  }, { a: ca.toString('base64'), b: cb.toString('base64'), z: cz.toString('base64') });
  if (save && process.argv.includes('--zoom')) { const z = await page.evaluate(async ({ a, b }) => { const dec = async (s) => createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob()); const A = await dec(a), B = await dec(b); const c = document.createElement('canvas'); c.width = 960; c.height = 480; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(A, 60, 140, 60, 80, 0, 0, 480, 480); x.drawImage(B, 60, 140, 60, 80, 480, 0, 480, 480); return c.toDataURL().split(',')[1]; }, { a: ca.toString('base64'), b: cb.toString('base64') }); fs.writeFileSync(`${save}/${name}.zoom.png`, Buffer.from(z, 'base64')); }
  console.log(name.padEnd(12), `mean=${d.mean.toFixed(3)} painted=${d.onPainted.toFixed(2)} px>12=${d.bigPx} max=${d.max} canvasLines=${modes.canvasLines} dom=${modes.domLines} drop=${modes.detailDropped} skip=${modes.skipped}`);
  sum += d.mean; n++;
}
console.log('MEAN over cases', (sum / n).toFixed(3));
await browser.close(); srv.close();
