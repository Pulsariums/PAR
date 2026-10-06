import type { ClipSpec } from '../types/script';

import { parseNum, parseNumList, splitArgs } from './TagValues';

/**
 * Rect corners as libass reads them: integers (`argtoi32` truncates), NOT reordered. A rect with
 * x2 <= x1 or y2 <= y1 is empty: `\clip` then hides the line, `\iclip` hides nothing.
 */
export const intRect = (n: number[]): [number, number, number, number] => [
  Math.trunc(n[0]), Math.trunc(n[1]), Math.trunc(n[2]), Math.trunc(n[3]),
];

/** `\clip(x1,y1,x2,y2)` | `\clip([scale,] drawing)`; `\iclip` likewise. Invalid => null. */
export const parseClip = (arg: string, inverse: boolean): ClipSpec | null => {
  const nums = parseNumList(arg);
  if (nums && nums.length === 4) return { inverse, rect: intRect(nums) };
  const parts = splitArgs(arg);
  if (parts.length > 2) return null;
  const scale = parts.length === 2 ? parseNum(parts[0]) : 1;
  if (scale === null) return null;
  const drawing = parts[parts.length - 1].trim();
  if (!/^[mnlbspc]/i.test(drawing)) return null;
  return { inverse, drawing, scale: Math.max(1, Math.trunc(scale)) };
};
