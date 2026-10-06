import type { DrawCommand } from '../types/script';

type Pt = [number, number];
const f = (n: number) => String(Math.round(n * 1000) / 1000);
const pt = (p: Pt, k: number) => `${f(p[0] / k)} ${f(p[1] / k)}`;

/** Uniform cubic B-spline window (c0..c3) => Bezier [start, control1, control2, end]. */
const splineWindow = (c: Pt[]): [Pt, Pt, Pt, Pt] => {
  const [c0, c1, c2, c3] = c;
  const start: Pt = [(c0[0] + 4 * c1[0] + c2[0]) / 6, (c0[1] + 4 * c1[1] + c2[1]) / 6];
  const end: Pt = [(c1[0] + 4 * c2[0] + c3[0]) / 6, (c1[1] + 4 * c2[1] + c3[1]) / 6];
  const k1: Pt = [(2 * c1[0] + c2[0]) / 3, (2 * c1[1] + c2[1]) / 3];
  const k2: Pt = [(c1[0] + 2 * c2[0]) / 3, (c1[1] + 2 * c2[1]) / 3];
  return [start, k1, k2, end];
};

/**
 * ASS drawing commands => SVG path data. Coordinates are divided by `2^(scale-1)` (`\p<scale>`,
 * `\clip(<scale>, ...)`). `m` starts a new closed shape (the last shape is closed too), `n` moves without closing, `b` cubic
 * Bezier, `s`/`p` uniform B-spline (converted to Beziers), `c` closes the spline.
 */
export const drawingToPath = (cmds: DrawCommand[], scale = 1): string => {
  const k = scale > 1 ? Math.pow(2, scale - 1) : 1;
  const out: string[] = [];
  let cur: Pt = [0, 0];
  let ctrl: Pt[] | null = null;
  const seg = (w: Pt[], first: boolean) => {
    const [s, c1, c2, e] = splineWindow(w);
    if (first) out.push(`L ${pt(s, k)}`);
    out.push(`C ${pt(c1, k)} ${pt(c2, k)} ${pt(e, k)}`);
    cur = e;
  };
  for (const { cmd, pts } of cmds) {
    if (cmd === 'c') {
      out.push('Z');
      ctrl = null;
      continue;
    }
    if (cmd === 's') {
      ctrl = [cur, ...pts];
      for (let i = 0; i + 4 <= ctrl.length; i++) seg(ctrl.slice(i, i + 4), i === 0);
      continue;
    }
    if (cmd === 'p' && ctrl) {
      for (const p of pts) {
        ctrl.push(p);
        seg(ctrl.slice(-4), false);
      }
      continue;
    }
    ctrl = null;
    if (cmd === 'm' || cmd === 'n') {
      if (cmd === 'm' && out.length) out.push('Z');
      out.push(`M ${pt(pts[0], k)}`);
      cur = pts[0];
    } else if (cmd === 'l') {
      out.push(`L ${pt(pts[0], k)}`);
      cur = pts[0];
    } else if (cmd === 'b') {
      out.push(`C ${pt(pts[0], k)} ${pt(pts[1], k)} ${pt(pts[2], k)}`);
      cur = pts[2];
    }
  }
  if (out.length && !out[0].startsWith('M')) out.unshift('M 0 0');
  // libass closes the last contour too: without it the stroke would miss the closing edge.
  if (out.length && out[out.length - 1] !== 'Z') out.push('Z');
  return out.join(' ');
};
