import type { DefaultLayoutOption, LayoutOption, LayoutSource } from '../types/options';
import type { ScriptInfo } from '../types/script';

import type { Size } from './Layout';

export const LAYOUT_720P: Size = { width: 1280, height: 720 };
/** What libass and VSFilter use when a script has no PlayRes. */
export const LAYOUT_LIBASS: Size = { width: 384, height: 288 };

export interface ResolvedLayout {
  size: Size;
  source: LayoutSource;
  /** True when one PlayRes side was missing and was derived from an aspect ratio (or the libass 4:3 rule). */
  derived: boolean;
}

const posInt = (v: string | undefined): number => {
  const n = v === undefined ? NaN : parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** PlayResX / PlayResY exactly as written in the script (0 = absent or invalid). The parser's `playResX` already has libass fallbacks applied. */
export const writtenPlayRes = (info: ScriptInfo | null): { x: number; y: number } => {
  let x = 0;
  let y = 0;
  for (const [k, v] of Object.entries(info?.raw ?? {})) {
    const key = k.toLowerCase();
    if (key === 'playresx') x = posInt(v);
    else if (key === 'playresy') y = posInt(v);
  }
  return { x, y };
};

export const defaultLayoutSize = (d: DefaultLayoutOption): Size =>
  d === 'libass' ? { ...LAYOUT_LIBASS } : typeof d === 'object' ? { width: d.width, height: d.height } : { ...LAYOUT_720P };

const whole = (n: number): number => Math.max(1, Math.round(n));

/**
 * Resolution order of the virtual (layout) size:
 *  1. `layout: { width, height }` option                      -> source 'option'
 *  2. script PlayResX and PlayResY (both)                       -> 'script'
 *  3. only one of them: the other follows the aspect ratio of `aspect` (the displayed region, else 16:9);
 *     with `defaultLayout: 'libass'` the libass rule instead (4:3, and 1280 <-> 1024) -> 'script', derived
 *  4. neither: `defaultLayout` (default 1280x720; 'libass' = 384x288) -> 'default'
 */
export const resolveLayout = (option: LayoutOption, info: ScriptInfo | null, def: DefaultLayoutOption, aspect?: Size | null): ResolvedLayout => {
  if (typeof option === 'object' && option.width > 0 && option.height > 0) {
    return { size: { width: option.width, height: option.height }, source: 'option', derived: false };
  }
  const { x, y } = writtenPlayRes(info);
  if (x > 0 && y > 0) return { size: { width: x, height: y }, source: 'script', derived: false };
  if (x > 0 || y > 0) {
    if (def === 'libass') return { size: { width: info!.playResX, height: info!.playResY }, source: 'script', derived: true };
    const ratio = aspect && aspect.width > 0 && aspect.height > 0 ? aspect.width / aspect.height : 16 / 9;
    return { size: x > 0 ? { width: x, height: whole(x / ratio) } : { width: whole(y * ratio), height: y }, source: 'script', derived: true };
  }
  return { size: defaultLayoutSize(def), source: 'default', derived: false };
};
