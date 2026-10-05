import type { ScriptInfo } from '../types/script';

import type { SourceLine } from './sections';
import { splitKeyValue } from './sections';

const posInt = (v: string | undefined): number => {
  const n = v === undefined ? NaN : parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * PlayRes fallback rules of libass:
 * none => 384x288; only X => Y = X*3/4 (1280 => 1024); only Y => X = Y*4/3 (1024 => 1280).
 */
export const resolvePlayRes = (x: number, y: number): { x: number; y: number; fallback: boolean } => {
  if (x > 0 && y > 0) return { x, y, fallback: false };
  if (x <= 0 && y <= 0) return { x: 384, y: 288, fallback: true };
  if (y <= 0) return { x, y: x === 1280 ? 1024 : Math.floor((x * 3) / 4), fallback: true };
  return { x: y === 1024 ? 1280 : Math.floor((y * 4) / 3), y, fallback: true };
};

const parseBool = (v: string | undefined, def: boolean): boolean => {
  if (v === undefined) return def;
  const t = v.trim().toLowerCase();
  if (t === 'yes' || t === 'true' || t === '1') return true;
  if (t === 'no' || t === 'false' || t === '0') return false;
  return def;
};

export const parseScriptInfo = (lines: SourceLine[]): ScriptInfo => {
  const raw: Record<string, string> = {};
  const lower: Record<string, string> = {};
  for (const { text } of lines) {
    const kv = splitKeyValue(text);
    if (!kv) continue;
    raw[kv[0]] = kv[1].trim();
    lower[kv[0].toLowerCase()] = kv[1].trim();
  }
  const play = resolvePlayRes(posInt(lower.playresx), posInt(lower.playresy));
  const wrap = parseInt(lower.wrapstyle ?? '0', 10);
  return {
    raw,
    scriptType: lower.scripttype ?? '',
    playResX: play.x,
    playResY: play.y,
    playResFallback: play.fallback,
    layoutResX: posInt(lower.layoutresx) || null,
    layoutResY: posInt(lower.layoutresy) || null,
    // Missing key => true (libass default; VSFilter treats it as "no").
    scaledBorderAndShadow: parseBool(lower.scaledborderandshadow, true),
    wrapStyle: wrap >= 0 && wrap <= 3 ? wrap : 0,
  };
};
