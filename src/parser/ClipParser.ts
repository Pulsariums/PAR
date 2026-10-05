import type { ClipSpec } from '../types/script';

import { parseNum, parseNumList, splitArgs } from './TagValues';

/** Normalized rect `[x1, y1, x2, y2]` with x1 <= x2, y1 <= y2. */
export const normRect = (n: number[]): [number, number, number, number] => [
  Math.min(n[0], n[2]), Math.min(n[1], n[3]), Math.max(n[0], n[2]), Math.max(n[1], n[3]),
];

/** `\clip(x1,y1,x2,y2)` | `\clip([scale,] drawing)`; `\iclip` likewise. Invalid => null. */
export const parseClip = (arg: string, inverse: boolean): ClipSpec | null => {
  const nums = parseNumList(arg);
  if (nums && nums.length === 4) return { inverse, rect: normRect(nums) };
  const parts = splitArgs(arg);
  if (parts.length > 2) return null;
  const scale = parts.length === 2 ? parseNum(parts[0]) : 1;
  if (scale === null) return null;
  const drawing = parts[parts.length - 1].trim();
  if (!/^[mnlbspc]/i.test(drawing)) return null;
  return { inverse, drawing, scale: Math.max(1, Math.round(scale)) };
};
