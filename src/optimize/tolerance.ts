import { numValue } from '../format/num';
import { TAG_BY_ID } from '../format/tagTable';
import type { AssStyle } from '../types/script';

import type { OptEvent } from './events';
import type { OptimizeMode } from './types';

/** What a fitted number measures: decides how much error is invisible. */
export type Kind = 'pos' | 'len' | 'angle' | 'scale' | 'shear' | 'spacing' | 'blur' | 'fs' | 'chan' | 'alpha';

/** Largest on-screen displacement (script pixels at the script's height) the modes allow. */
const TOL_PX: Record<OptimizeMode, number> = { exact: 0.00125, invisible: 0.125, loose: 0.5 };
/** Colour channels and alphas are whole numbers 0..255: one level is invisible, none is exact. */
const LEVELS: Record<OptimizeMode, number> = { exact: 0.5, invisible: 2, loose: 4 };

/** How big the event is: the lever arm that turns an error in an angle or a scale into pixels. */
export interface Geo {
  /** Estimated text width and height (script px) at the largest size / scale of the chain. */
  width: number;
  height: number;
  chars: number;
  /** Distance from `\pos` to `\org` (the rotation centre) when the event has one. */
  orgDist: number;
  /** Has `\org`: the glyphs swing around a point far from `\pos`, so no radius around `\pos` bounds them. */
  org: boolean;
  /** Radius around `\pos` that holds every pixel the event can draw (its farthest corner from the anchor, plus outline, shadow and blur); Infinity when it cannot be bounded. */
  reach: number;
}

const slotMax = (evs: readonly OptEvent[], name: string): number | null => {
  let best: number | null = null;
  for (const e of evs) for (const p of e.parts) {
    if (p.how !== 'num' || p.tag.k !== 'n' || TAG_BY_ID[p.tag.id]!.name !== name) continue;
    best = Math.max(best ?? -Infinity, e.vals[p.at]);
  }
  return best;
};

/** Size of the events of one chain, from the style and the tags that vary. Generous (0.9 em per character) so errors are never underestimated. */
export const geometryOf = (evs: readonly OptEvent[], style: AssStyle | undefined): Geo => {
  const first = evs[0];
  const fs = Math.max(slotMax(evs, 'fs') ?? 0, style?.fontSize ?? 48, 1);
  const sx = Math.max(slotMax(evs, 'fscx') ?? 0, style?.scaleX ?? 100, 1) / 100;
  const sy = Math.max(slotMax(evs, 'fscy') ?? 0, style?.scaleY ?? 100, 1) / 100;
  const chars = [...first.text].length;
  let orgDist = 0;
  const org = first.parts.find((p) => p.tag.k === 'n' && TAG_BY_ID[p.tag.id]!.name === 'org');
  const pos = first.parts.find((p) => p.how === 'pos');
  if (org && org.tag.k === 'n' && pos) orgDist = Math.hypot(numValue(org.tag.nums[0]) - first.vals[pos.at], numValue(org.tag.nums[1]) - first.vals[pos.at + 1]);
  const width = Math.max(chars * fs * 0.9 * sx, fs * sx), height = fs * sy;
  const bord = Math.max(slotMax(evs, 'bord') ?? 0, slotMax(evs, 'xbord') ?? 0, slotMax(evs, 'ybord') ?? 0, style?.outline ?? 0);
  const shad = Math.max(slotMax(evs, 'shad') ?? 0, slotMax(evs, 'xshad') ?? 0, slotMax(evs, 'yshad') ?? 0, style?.shadow ?? 0);
  const blur = Math.max(slotMax(evs, 'blur') ?? 0, slotMax(evs, 'be') ?? 0);
  // Text hangs off the anchor (`\pos`) by half its size on each side the alignment does not centre on; a rotation about the anchor keeps it within that distance.
  const an = (first.parts.find((p) => p.tag.k === 'n' && TAG_BY_ID[p.tag.id]!.name === 'an')?.tag as { nums?: Array<{ m: number; d: number }> } | undefined)?.nums?.[0];
  const align = an ? Math.round(numValue(an)) : style?.alignment ?? 2;
  const hang = (align - 1) % 3 === 1 ? 0 : width / 2;
  const rise = align >= 4 && align <= 6 ? 0 : height / 2;
  const reach = org ? Infinity : Math.hypot(width / 2 + hang, height / 2 + rise) + 2 * (bord + shad) + 6 * blur + 4;
  return { width, height, chars, orgDist, org: !!org, reach };
};

/** Largest error allowed on a number of this kind: the one that moves any point of the event by at most the mode's pixel tolerance. */
export const allowed = (kind: Kind, value: number, g: Geo, mode: OptimizeMode): number => {
  if (kind === 'chan' || kind === 'alpha') return LEVELS[mode];
  const px = TOL_PX[mode];
  switch (kind) {
    case 'pos': case 'len': return px;
    case 'blur': return px / 2;
    case 'angle': return px / (((Math.hypot(g.width, g.height) + g.orgDist) * Math.PI) / 180);
    case 'scale': return px / (Math.max(g.width, g.height) / 100);
    case 'shear': return px / Math.max(g.height, 1);
    case 'spacing': return px / Math.max(g.chars, 1);
    case 'fs': return (px * Math.max(Math.abs(value), 1)) / Math.max(g.width, 1);
  }
};

/** Share of the budget spent on the fitted line itself; the rest is for rounding the written numbers. */
export const FIT_SHARE = 0.85;

/**
 * Error the fitted line itself may have. Whole-number channels pay two roundings on top of the fit (the written endpoints, then PAR rounds
 * every interpolated value: half a level each), so those come off the budget; the rest keeps a share for rounding the written decimals.
 */
export const fitAllowed = (kind: Kind, value: number, g: Geo, mode: OptimizeMode): number => {
  const a = allowed(kind, value, g, mode);
  return kind === 'chan' || kind === 'alpha' ? Math.max(a - 1, 1e-6) : a * FIT_SHARE;
};
