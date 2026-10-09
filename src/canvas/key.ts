import type { Sprite } from './raster';
import type { Resolved, Run } from './CanvasLayer';
import type { SpriteSpec } from './types';

const n = (v: number): string => String(Math.round(v * 1000) / 1000);

/** Stable key of a spec: equal keys <=> identical bitmaps. */
export const specKey = (s: SpriteSpec): string =>
  `${s.text}|${s.family}|${s.weight}${s.italic ? 'i' : ''}|${s.size}|${s.ratio}|${s.rx}|${n(s.spacing)}|${s.kerning ? 1 : 0}|${s.scale}|` +
  s.plates.map((p) => `${p.fill ?? '-'},${p.stroke ?? '-'},${n(p.strokeW)},${n(p.dx)},${n(p.dy)},${p.blur},${p.carve ? 1 : 0},${p.shadow ? `${n(p.shadow.dx)}:${n(p.shadow.dy)}:${p.shadow.colour}` : '-'}`).join(';');

const hash = (text: string): string => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};

/** Bounded signature of the ordered canvas inputs and whether each requested sprite resolved. */
export const frameSignature = (runs: readonly Run[], resolved: Resolved): string => {
  let source = '';
  runs.forEach((run, i) => {
    source += `${run.layer},${run.index}|`;
    run.items.forEach((it, k) => {
      source += `${it.id},${it.index},${it.layer},${it.key},${n(it.alpha)},${n(it.anchor[0])},${n(it.anchor[1])},${n(it.org[0])},${n(it.org[1])},${n(it.rot)},${n(it.size)},${n(it.ax)},${n(it.ay)},${n(it.shx)},${n(it.shy)},${it.still ? 1 : 0}|`;
      source += it.clip.map((c) => c.rect ? `r${c.rect.join(',')}` : `p${c.d},${c.evenodd ? 1 : 0},${c.bbox?.join(',') ?? ''}`).join(';');
      source += `|${resolved[i]?.[k] ? ('x' in (resolved[i][k] as Sprite) ? 'b' : 's') : '0'};`;
    });
  });
  return hash(source);
};
