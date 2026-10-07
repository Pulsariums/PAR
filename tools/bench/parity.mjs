// Sprites built in Workers vs on the main thread: same pixels? node tools/bench/parity.mjs --font LiberationSans-Regular.ttf [--dist dist]
// Each case starts its events at 3 s, renders at 0 (the look-ahead builds everything, in the pool or on the main thread), waits, renders at 4 s
// and screenshots. Identical PNG bytes = identical pixels. The metrics tell how many sprites the workers delivered and how many were still built at draw time.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from './pw.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };
const dist = path.resolve(arg('dist', 'dist')), fontFile = path.resolve(arg('font', ''));
const HEAD = `[Script Info]\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 360\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Liberation Sans,44,&H00FFFFFF,&H0000FF00,&H00202020,&H80000000,0,0,0,0,100,100,0,0,1,0,0,5,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
const cases = {
  blur: () => `\\blur3\\c&HF1D00F&`, bord_blur: () => `\\bord3\\blur2\\3c&H0000FF&`, shadow: () => `\\shad4\\blur1\\bord2`,
  aniso: () => `\\fscx70\\fscy130\\blur2\\c&H3DE2F8&`, rot_move: (i, x, y) => `\\move(${x - 30},${y},${x + 30},${y + 10},0,3000)\\frz${25 + i * 20}\\blur1`,
  clip_rect: (i, x, y) => `\\clip(${x - 15},${y - 40},${x + 40},${y + 18})\\blur1`, fade: () => `\\fad(1500,0)\\bord2\\blur2`,
  translucent: () => `\\1a&H80&\\bord3\\blur1\\3c&HFF0000&`, shear_rot: () => `\\fax0.25\\fay0.15\\frz20\\blur1.5`,
  trans: () => `\\blur1\\c&HF8E23D&\\t(0,2000,\\blur6\\c&H0000FF&\\fscx150\\fscy150\\frz90)`, fs_small: () => `\\fs18\\blur2`,
};
const grp = (s, e, fn) => [...'Kara'].map((ch, i) => { const x = 90 + i * 150, y = 180; return `Dialogue: 0,${s},${e},Default,,0,0,0,,{\\an5\\pos(${x},${y})${fn(i, x, y)}}${ch}`; }).join('\n') + '\n';
// group 1 boots the pool (the first slice runs before the workers are up and builds on the main thread); group 2 enters the horizon later and is built by the workers
const mk = (fn) => HEAD + grp('0:00:03.00', '0:00:08.00', fn) + grp('0:00:13.00', '0:00:18.00', fn);
const srv = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<body style="margin:0"><div id="a" style="position:absolute;left:0;top:0;width:640px;height:360px;overflow:hidden;background:#667"></div></body>'); }
  const f = u === '/font.ttf' ? fontFile : path.join(dist, u.slice(1));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-lcd-text', '--font-render-hinting=none'] });
const page = await (await browser.newContext({ viewport: { width: 660, height: 400 }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.error('PAGEERR', e.message));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.evaluate(async () => { window.P = await import('/par.js'); window.font = new Uint8Array(await (await fetch('/font.ttf')).arrayBuffer()); });
let same = 0, n = 0;
for (const [name, fn] of Object.entries(cases)) {
  const shots = {};
  for (const w of ['off', 'auto']) {
    const m = await page.evaluate(async ({ ass, w }) => {
      window.__PAR_SPRITE_WORKERS = w;
      const el = document.getElementById('a'); el.replaceChildren();
      const p = window.P.create({ container: el, subtitle: ass, region: 'container', renderMode: 'canvas', fonts: [window.font.slice()], videoFps: 24 });
      await p.ready;
      p.renderAt(0);
      await new Promise((r) => setTimeout(r, 500));
      p.renderAt(5);
      await new Promise((r) => setTimeout(r, 700));
      const before = p.getMetrics().render;
      p.renderAt(14);
      const after = p.getMetrics().render;
      const out = { workers: before.workers, workerBuilt: before.workerBuilt, prewarmed: before.prewarmed, drawMisses: after.spriteMisses - before.spriteMisses, drawn: after.drawn };
      return out;
    }, { ass: mk(fn), w });
    shots[w] = { png: await page.locator('#a').screenshot(), m };
    await page.evaluate(() => { document.getElementById('a').replaceChildren(); });
  }
  const eq = shots.off.png.equals(shots.auto.png);
  same += eq ? 1 : 0; n++;
  console.log(name.padEnd(12), eq ? 'IDENTICAL' : 'DIFFERENT', `off: ${JSON.stringify(shots.off.m)} auto: ${JSON.stringify(shots.auto.m)}`);
}
console.log(`${same}/${n} identical`);
await browser.close(); srv.close();
