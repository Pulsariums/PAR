// Shared pieces of the zero-stutter benches (zs-*.mjs): synthetic karaoke script, static server, browser launch, statistics.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire('/opt/node-tools/');
export const { chromium } = req('playwright-core');
export const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const W = 1280, H = 720;

export const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };
export const has = (k) => process.argv.includes('--' + k);

const ts = (t) => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, x = t - h * 3600 - m * 60; return `${h}:${String(m).padStart(2, '0')}:${x.toFixed(2).padStart(5, '0')}`; };
const GLYPHS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'].slice(0, 40);
const COLORS = ['&HF1D00F&', '&H3DE2F8&', '&H0000FF&', '&HFFFFFF&', '&H55D0FF&', '&HC080FF&'];

/**
 * The report's pattern: a burst of `n` blurred per-glyph particles (\an5, \pos or \move, \blur, \c, \frz, \fad, some with \t) every `every` s for
 * `seconds`, dialogue lines in between, a quiet part (22-32 s), a new "scene" of sizes every 6 s so keys keep being new.
 */
export const synth = ({ seconds = 60, every = 2, n = 1100, seed = 7, animate = 0.08 } = {}) => {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let o = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1280\nPlayResY: 720\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Liberation Sans,48,&H00FFFFFF,&H0000FF00,&H00202020,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,30,1\nStyle: Kara,Liberation Sans,44,&H00FFFFFF,&H0000FF00,&H00202020,&H80000000,0,0,0,0,100,100,0,0,1,2,0,8,10,10,40,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  for (let t = 0; t < seconds; t += 3) o += `Dialogue: 0,${ts(t)},${ts(Math.min(seconds, t + 2.8))},Default,,0,0,0,,Dialogue line ${t / 3 | 0}: a quiet moment with plain text\n`;
  for (let T = 2; T < seconds - 1; T += every) {
    if (T >= 22 && T < 32) continue;
    const scene = Math.floor(T / 6), sizes = [0, 1, 2, 3, 4].map((k) => 26 + ((scene * 7) % 11) + k * 9), lead = rnd() * 0.03;
    for (let i = 0; i < n; i++) {
      const st = T + lead + rnd() * 0.12, dur = 0.5 + rnd() * 0.9, x = 70 + rnd() * 1140 | 0, y = 60 + rnd() * 600 | 0, fs = sizes[rnd() * 5 | 0], bl = [1, 2, 3.5][rnd() * 3 | 0];
      const mv = rnd() < 0.5 ? `\\move(${x},${y},${x + (rnd() * 120 - 60 | 0)},${y + (rnd() * 120 - 60 | 0)})` : `\\pos(${x},${y})`;
      const c = COLORS[rnd() * COLORS.length | 0], c2 = COLORS[rnd() * COLORS.length | 0], d = Math.round(dur * 1000);
      o += `Dialogue: 1,${ts(st)},${ts(st + dur)},Kara,,0,0,0,,{\\an5${mv}\\fs${fs}\\blur${bl}\\c${c}\\frz${rnd() * 360 | 0}\\fad(60,${Math.min(300, d / 2) | 0})${rnd() < animate ? `\\t(0,${d},\\c${c2}\\blur${bl + 1})` : ''}}${GLYPHS[rnd() * GLYPHS.length | 0]}\n`;
    }
  }
  return o;
};

/** Serves `dist` (the build under test), the script at /file and an empty stage page at /. */
export const serve = (dist, file, video = '') => {
  const srv = http.createServer((rq, res) => {
    const u = rq.url.split('?')[0];
    if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(`<body style="margin:0;background:#445"><div id="c" style="position:relative;width:${W}px;height:${H}px;background:#445;overflow:hidden"></div></body>`); }
    if (u === '/video' && video) { const st = fs.statSync(video), m = /bytes=(\d+)-(\d*)/.exec(rq.headers.range || ''); const a = m ? +m[1] : 0, b = m && m[2] ? +m[2] : st.size - 1; res.writeHead(m ? 206 : 200, { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-length': b - a + 1, ...(m ? { 'content-range': `bytes ${a}-${b}/${st.size}` } : {}) }); return fs.createReadStream(video, { start: a, end: b }).pipe(res); }
    const f = u === '/file' ? file : path.join(dist, u.slice(1));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  return srv;
};

export const q = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
export const r1 = (v) => Math.round(v * 10) / 10;

/** Frame gap statistics of an array of ms gaps. */
export const gapStats = (g) => ({
  n: g.length, p50: r1(q(g, .5)), p95: r1(q(g, .95)), p99: r1(q(g, .99)), max: r1(Math.max(0, ...g)),
  o33: g.filter((x) => x > 33).length, o50: g.filter((x) => x > 50).length, o100: g.filter((x) => x > 100).length,
});

/** Top self-time functions of a CDP CPU profile (name, url:line), as [ms, label] sorted. */
export const topSelf = (prof, n = 18) => {
  const by = new Map(); const dt = prof.timeDeltas; const idx = new Map(prof.nodes.map((x) => [x.id, x]));
  prof.samples.forEach((id, i) => { const nd = idx.get(id); const f = nd.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`; by.set(k, (by.get(k) ?? 0) + (dt[i] ?? 0) / 1000); });
  return [...by].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${Math.round(v)} ms  ${k}`);
};
