// Synthetic script that reproduces a user's report (113k-event karaoke ASS, canvas mode): a burst of 1000+ per-glyph particles with blur
// every ~2 s for 60 s, quiet parts (dialogue only) in between, and a new "scene" (other sizes) every 6 s so sprites keep missing.
// node tools/bench/gen-karaoke.mjs out.ass [--seconds 60] [--every 2] [--n 1100] [--seed 7] [--animate 0.08]
// --animate: share of particles that animate colour and blur with \t (an animated colour is part of the sprite key, so every frame is another sprite: 1 = a stress test far beyond the report).
import fs from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };
const out = process.argv[2] ?? 'karaoke.ass';
const anim = +arg('animate', 0.08), secs = +arg('seconds', 60), every = +arg('every', 2), N = +arg('n', 1100);
let s = (+arg('seed', 7)) >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ts = (t) => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, x = t - h * 3600 - m * 60; return `${h}:${String(m).padStart(2, '0')}:${x.toFixed(2).padStart(5, '0')}`; };
const GLYPHS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'].slice(0, 40);
const COLORS = ['&HF1D00F&', '&H3DE2F8&', '&H0000FF&', '&HFFFFFF&', '&H55D0FF&', '&HC080FF&'];
let o = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1280\nPlayResY: 720\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Liberation Sans,48,&H00FFFFFF,&H0000FF00,&H00202020,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,30,1\nStyle: Kara,Liberation Sans,44,&H00FFFFFF,&H0000FF00,&H00202020,&H80000000,0,0,0,0,100,100,0,0,1,2,0,8,10,10,40,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
let n = 0;
for (let t = 0; t < secs; t += 3) { o += `Dialogue: 0,${ts(t)},${ts(Math.min(secs, t + 2.8))},Default,,0,0,0,,Dialogue line ${t / 3 | 0}: a quiet moment with plain text\n`; n++; }
for (let T = 2; T < secs - 1; T += every) {
  if (T >= 22 && T < 32) continue; // quiet part
  const scene = Math.floor(T / 6), sizes = [0, 1, 2, 3, 4].map((k) => 26 + ((scene * 7) % 11) + k * 9);
  const lead = rnd() * 0.03; // the whole burst lands within about 4 frames at 24 fps
  for (let i = 0; i < N; i++) {
    const st = T + lead + rnd() * 0.12, dur = 0.5 + rnd() * 0.9, x = 70 + rnd() * 1140 | 0, y = 60 + rnd() * 600 | 0, fs = sizes[rnd() * 5 | 0], bl = [1, 2, 3.5][rnd() * 3 | 0];
    const mv = rnd() < 0.5 ? `\\move(${x},${y},${x + (rnd() * 120 - 60 | 0)},${y + (rnd() * 120 - 60 | 0)})` : `\\pos(${x},${y})`;
    const c = COLORS[rnd() * COLORS.length | 0], c2 = COLORS[rnd() * COLORS.length | 0], d = Math.round(dur * 1000);
    o += `Dialogue: 1,${ts(st)},${ts(st + dur)},Kara,,0,0,0,,{\\an5${mv}\\fs${fs}\\blur${bl}\\c${c}\\frz${rnd() * 360 | 0}\\fad(60,${Math.min(300, d / 2) | 0})${rnd() < anim ? `\\t(0,${d},\\c${c2}\\blur${bl + 1})` : ''}}${GLYPHS[rnd() * GLYPHS.length | 0]}\n`; n++;
  }
}
fs.writeFileSync(out, o);
console.log(`${out}: ${n} events, ${(o.length / 1e6).toFixed(1)} MB`);
