import { parFileName, type SniffKind } from '../../../src/format';
import { baseName } from '../common/exportName';

/** What a file can be turned into: ASS -> XPAR | PAR, XPAR | PAR -> ASS. Pure rules of the converter card (no DOM). */
export type Action = 'xpar' | 'par' | 'ass';

export const FPS_PRESETS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60] as const;
export const DEFAULT_FPS = 24;
export const FPS_MIN = 1;
export const FPS_MAX = 1000;
/** Files up to this size are verified (decode + SHA-256) by default; bigger ones only when the user ticked the box themselves. */
export const VERIFY_AUTO_BYTES = 20 * 1024 * 1024;

export const actionsFor = (kind: SniffKind): Action[] => (kind === 'ass' ? ['xpar', 'par'] : kind === 'unknown' ? [] : ['ass']);

/** "29,97" / " 23.976 " -> 29.97 / 23.976; null when empty, not a number or outside 1..1000. Rounded to 3 decimals (PAR stores fps x 1000). */
export const parseFps = (raw: string): number | null => {
  const s = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Math.round(Number(s) * 1000) / 1000;
  return v >= FPS_MIN && v <= FPS_MAX ? v : null;
};

/** Download name: `<name>.xpar`, `<name>.<fps>fps.par`, `<name>.ass` (from XPAR, the original) or `<name>.baked.ass` (from PAR, not the original). */
export const outputName = (action: Action, name: string, kind: SniffKind, fps: number): string => {
  const base = baseName(name) || 'subtitles';
  if (action === 'xpar') return `${base}.xpar`;
  if (action === 'par') return parFileName(base, fps);
  return kind === 'par' ? `${base}.baked.ass` : `${base}.ass`;
};

/** Verification applies to XPAR output only. `touched`: the user changed the checkbox, so their choice wins over the size rule. */
export const shouldVerify = (action: Action, checked: boolean, touched: boolean, size: number): boolean =>
  action === 'xpar' && checked && (touched || size <= VERIFY_AUTO_BYTES);

/** Output / input in percent with one decimal; "-" when the input is empty. */
export const ratioPct = (out: number, input: number): string => (input > 0 ? `${Math.round((out / input) * 1000) / 10}%` : '-');
