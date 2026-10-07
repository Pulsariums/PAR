import type { DrawCmd, DrawCommand } from '../types/script';

const TOKEN_RE = /[a-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;
const CMDS = new Set<string>(['m', 'n', 'l', 'b', 's', 'p', 'c']);

/** Safety cap: points beyond this are dropped (a drawing is parsed lazily, so a huge one costs no more than this). */
export const MAX_DRAWING_POINTS = 100_000;
/** Coordinates are clamped to this (libass saturates its fixed-point coordinates; `1e999` must never reach the SVG path). */
export const MAX_DRAWING_COORD = 1e7;

const coord = (token: string): number => {
  const v = Number(token);
  return Number.isNaN(v) ? 0 : Math.max(-MAX_DRAWING_COORD, Math.min(MAX_DRAWING_COORD, v));
};

/**
 * ASS drawing text => command list. Accepts compact forms (`m0 0l10 10`) and implicit
 * command repetition (`l 1 1 2 2`). Incomplete trailing groups are dropped and unknown
 * commands are skipped (libass behaviour). Linear time; stops after `MAX_DRAWING_POINTS` points.
 */
export const parseDrawing = (text: string): DrawCommand[] => {
  const out: DrawCommand[] = [];
  const re = new RegExp(TOKEN_RE.source, 'gi');
  const next = (): string | null => re.exec(text)?.[0] ?? null;
  const isCmd = (t: string): boolean => /^[a-z]/i.test(t);
  let points = 0;
  let tok = next();
  while (tok !== null && points < MAX_DRAWING_POINTS) {
    const t = tok.toLowerCase();
    tok = next();
    if (!CMDS.has(t)) continue;
    const cmd = t as DrawCmd;
    if (cmd === 'c') {
      out.push({ cmd, pts: [] });
      continue;
    }
    const nums: number[] = [];
    while (tok !== null && !isCmd(tok) && nums.length < 2 * (MAX_DRAWING_POINTS - points)) {
      nums.push(coord(tok));
      tok = next();
    }
    const pairs: Array<[number, number]> = [];
    for (let k = 0; k + 1 < nums.length; k += 2) pairs.push([nums[k], nums[k + 1]]);
    points += pairs.length;
    if (cmd === 'b') {
      for (let k = 0; k + 3 <= pairs.length; k += 3) out.push({ cmd, pts: pairs.slice(k, k + 3) });
    } else if (cmd === 's') {
      if (pairs.length >= 3) out.push({ cmd, pts: pairs });
    } else if (cmd === 'p') {
      if (pairs.length) out.push({ cmd, pts: pairs });
    } else {
      for (const p of pairs) out.push({ cmd, pts: [p] });
    }
  }
  return out;
};

/** Bounding box of all points (null when there are none). */
export const drawingBounds = (cmds: DrawCommand[]): [number, number, number, number] | null => {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const c of cmds) {
    for (const [x, y] of c.pts) {
      x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
    }
  }
  return x1 === Infinity ? null : [x1, y1, x2, y2];
};

/**
 * `[x1, y1, x2, y2]` when the drawing is one axis-aligned rectangle (`m x1 y1 l x2 y1 x2 y2 x1 y2`, closing point optional, any
 * start corner or winding), else null. A rectangle written as a vector clip is the same region as the `\clip(x1,y1,x2,y2)` form.
 */
export const rectOfDrawing = (cmds: DrawCommand[]): [number, number, number, number] | null => {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    if (i === 0 ? c.cmd !== 'm' : c.cmd !== 'l') return null;
    if (c.pts.length !== 1) return null;
    pts.push(c.pts[0]);
  }
  if (pts.length === 5 && pts[4][0] === pts[0][0] && pts[4][1] === pts[0][1]) pts.pop();
  if (pts.length !== 4) return null;
  const hv = pts.every((p, i) => {
    const q = pts[(i + 1) % 4];
    return (p[0] === q[0]) !== (p[1] === q[1]);
  });
  const horizontal = pts[0][1] === pts[1][1];
  const alt = pts.every((p, i) => {
    const q = pts[(i + 1) % 4];
    return i % 2 === 0 ? (horizontal ? p[1] === q[1] : p[0] === q[0]) : (horizontal ? p[0] === q[0] : p[1] === q[1]);
  });
  if (!hv || !alt) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
