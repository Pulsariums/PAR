import type { SpriteSpec } from './types';

const n = (v: number): string => String(Math.round(v * 1000) / 1000);

/** Stable key of a spec: equal keys <=> identical bitmaps. */
export const specKey = (s: SpriteSpec): string =>
  `${s.text}|${s.family}|${s.weight}${s.italic ? 'i' : ''}|${s.size}|${s.ratio}|${s.rx}|${n(s.spacing)}|${s.kerning ? 1 : 0}|${s.scale}|` +
  s.plates.map((p) => `${p.fill ?? '-'},${p.stroke ?? '-'},${n(p.strokeW)},${n(p.dx)},${n(p.dy)},${p.blur},${p.carve ? 1 : 0},${p.shadow ? `${n(p.shadow.dx)}:${n(p.shadow.dy)}:${p.shadow.colour}` : '-'}`).join(';');
