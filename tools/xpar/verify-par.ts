import { openAsBlob } from 'node:fs';

import { indexAss, openXpar } from '../../src/format';

import { fileSource } from './node-io';

/**
 * Visual equivalence of a .par against its source ASS, rendered by PAR itself in headless Chromium.
 *   verify-par <source.ass> <file.par> --fps N [--frames 24] [--size 960x540] [--bundle path/par.global.js]
 * For each sampled frame k (t = k/fps) both documents are loaded (only the events active at t), rendered with
 * PAR, screenshotted, and compared per pixel. Control: source(t) vs source(t + 1 frame) shows the metric reacts.
 */
const argv = process.argv.slice(2);
const opt = (n: string, d: string): string => {
  const i = argv.indexOf(n);
  return i === -1 ? d : argv.splice(i, 2)[1];
};
const fps = Number(opt('--fps', '24'));
const nFrames = Number(opt('--frames', '24'));
const [w, h] = opt('--size', '960x540').split('x').map(Number);
const bundle = opt('--bundle', 'dist/par.global.js');
const phase = Number(opt('--phase', '0'));
const [srcPath, parPath] = argv;

const PW = '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(/* @vite-ignore */ PW);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const ix = await indexAss(await openAsBlob(srcPath));
const par = await openXpar(fileSource(parPath));
const dur = Math.max(ix.duration, par.duration);
const first = Math.floor(0.5 * fps);
const last = Math.floor(dur * fps);
const frames = Array.from({ length: nFrames }, (_v, i) => first + Math.floor(((last - first) * (i + 0.5)) / nFrames));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: w + 20, height: h + 20 } });
await page.setContent(`<body style="margin:0;background:#303030"><div id="a" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;overflow:hidden"></div></body>`);
await page.addScriptTag({ path: bundle });
await page.evaluate(() => {
  const g = globalThis as unknown as { PAR: { create: (o: unknown) => { setSubtitle: (s: string) => void; renderAt: (t: number) => void } } };
  const el = document.getElementById('a')!;
  Object.assign(globalThis, { r: g.PAR.create({ container: el, subtitle: '' }) });
});
const shot = async (text: string, t: number): Promise<string> => {
  await page.evaluate(([s, tt]) => {
    const r = (globalThis as unknown as { r: { setSubtitle: (x: string) => void; renderAt: (t: number) => void } }).r;
    r.setSubtitle(s as string);
    r.renderAt(tt as number);
  }, [text, t]);
  return (await page.locator('#a').screenshot()).toString('base64');
};
const diff = async (a: string, b: string): Promise<{ max: number; mean: number; over8: number; content: number }> =>
  page.evaluate(async ([x, y]) => {
    const load = (b64: string): Promise<ImageData> =>
      new Promise((res) => {
        const im = new Image();
        im.onload = () => {
          const c = document.createElement('canvas');
          c.width = im.width;
          c.height = im.height;
          const g = c.getContext('2d')!;
          g.drawImage(im, 0, 0);
          res(g.getImageData(0, 0, c.width, c.height));
        };
        im.src = `data:image/png;base64,${b64}`;
      });
    const [A, B] = await Promise.all([load(x as string), load(y as string)]);
    let max = 0, sum = 0, over = 0, content = 0;
    const px = A.width * A.height;
    for (let i = 0; i < px; i++) {
      let m = 0;
      for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(A.data[i * 4 + k] - B.data[i * 4 + k]));
      if (Math.abs(A.data[i * 4] - 0x30) + Math.abs(A.data[i * 4 + 1] - 0x30) + Math.abs(A.data[i * 4 + 2] - 0x30) > 6) content++;
      max = Math.max(max, m);
      sum += m;
      if (m > 8) over++;
    }
    return { max, mean: sum / px, over8: over / px, content: content / px };
  }, [a, b]);

const rows: Array<{ k: number; n: number; d: Awaited<ReturnType<typeof diff>>; ctl: Awaited<ReturnType<typeof diff>>; self: Awaited<ReturnType<typeof diff>> }> = [];
for (const k of frames) {
  const t = (k + phase) / fps;
  const eps = 1e-4;
  const srcText = await ix.readWindowText(t, t + eps);
  const parText = await par.readWindowText(t, t + eps);
  const nSrc = (await ix.readWindowLines(t, t + eps)).length;
  const a = await shot(srcText, t);
  const b = await shot(parText, t);
  const t2 = (k + 1 + phase) / fps;
  const c = await shot(await ix.readWindowText(t2, t2 + eps), t2);
  rows.push({ k, n: nSrc, d: await diff(a, b), ctl: await diff(a, c), self: await diff(a, await shot(srcText, t)) });
}
await browser.close();
const f = (n: number, d = 3): string => n.toFixed(d);
console.log(`frame  srcLines  content%  maxDiff  meanDiff  px>8/255 %   | control(next frame) max  mean`);
for (const r of rows) console.log(`${String(r.k).padStart(5)}  ${String(r.n).padStart(8)}  ${f(r.d.content * 100, 1).padStart(8)}  ${String(r.d.max).padStart(7)}  ${f(r.d.mean, 4).padStart(8)}  ${f(r.d.over8 * 100, 4).padStart(10)}   | ${String(r.ctl.max).padStart(5)}  ${f(r.ctl.mean, 4)}`);
const mean = rows.reduce((s, r) => s + r.d.mean, 0) / rows.length;
console.log(`SUMMARY ${rows.length} frames @${fps} fps ${w}x${h}: max pixel diff ${Math.max(...rows.map((r) => r.d.max))}/255, mean diff ${f(mean, 5)}/255, worst px>8/255 fraction ${f(Math.max(...rows.map((r) => r.d.over8)) * 100, 4)} %, control mean ${f(rows.reduce((s, r) => s + r.ctl.mean, 0) / rows.length, 4)}, render-twice max ${Math.max(...rows.map((r) => r.self.max))}`);
