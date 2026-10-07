import type { PreparedLine } from '../anim/Prepared';
import { SOFT_BREAK, type SetOp, type StateOp } from '../types/script';

import type { RenderMode } from './types';

/** Tags the canvas path reproduces exactly; anything else (3D rotation, `\be`, karaoke, underline...) stays DOM. */
const ALLOWED = new Set(['fn', 'fs', 'b', 'i', 'fscx', 'fscy', 'fsp', 'frz', 'fax', 'fay', 'xbord', 'ybord', 'xshad', 'yshad', 'blur', 'c1', 'c2', 'c3', 'c4', 'a1', 'a2', 'a3', 'a4']);
const MAX_CHARS = 16;

export interface Complexity {
  eligible: boolean;
  /** Why not (empty when eligible). */
  reason: string;
  /** Rough DOM cost of the line: filters and plates dominate. */
  score: number;
  /** State keys a `\t` animates (their sprite variants are quantised). */
  animated: ReadonlySet<string>;
}

const opsOf = (line: PreparedLine): StateOp[] => line.event.fragments.flatMap((f) => f.ops);

const badOp = (o: StateOp): string => {
  if (o.type === 'r') return 'reset';
  if (o.type === 'set') return badSet(o);
  for (const s of o.ops) {
    if (s.type === 'r') return 'reset';
    const r = badSet(s);
    if (r) return r;
  }
  return '';
};

const badSet = (o: SetOp): string => {
  if (o.key === 'be' && o.value !== null && Number(o.value) === 0) return '';
  return ALLOWED.has(o.key) ? '' : `tag ${o.key}`;
};

/** Pure decision whether one event can be drawn by the canvas path, and how expensive it is as DOM. */
export const analyzeLine = (line: PreparedLine): Complexity => {
  const no = (reason: string): Complexity => ({ eligible: false, reason, score: 0, animated: new Set() });
  const f = line.event.fragments;
  if (f.length !== 1) return no('fragments');
  const frag = f[0];
  if (frag.drawingScale > 0) return no('drawing');
  if (frag.karaoke) return no('karaoke');
  if (line.stacks) return no('stacking');
  if (line.style.borderStyle === 3) return no('box');
  if (/[\s⁠]/.test(frag.text) || frag.text.includes(SOFT_BREAK) || frag.text.length === 0) return no('whitespace');
  const chars = [...frag.text];
  if (chars.length > MAX_CHARS) return no('long');
  const animated = new Set<string>();
  for (const o of opsOf(line)) {
    const bad = badOp(o);
    if (bad) return no(bad);
    const sets = (o.type === 'set' ? [o] : o.type === 't' ? o.ops : []).filter((x): x is SetOp => x.type === 'set');
    for (const x of sets) {
      if (o.type === 't') animated.add(x.key);
    }
  }
  const score = 1 + (line.plated ? 3 : 0) + (line.animated ? 1 : 0) + (line.event.lineTags.clip || line.event.lineTags.vclip ? 1 : 0);
  return { eligible: true, reason: '', score, animated };
};

/** Total score at which `'auto'` starts routing qualifying lines to the canvas (about 10 plain particles). */
export const AUTO_LOAD = 24;

/** Mode of a line that just appeared: `load` = summed score of the qualifying lines visible now (this one included). */
export const chooseMode = (mode: RenderMode, c: Complexity, load: number, canvasBusy: boolean): 'dom' | 'canvas' => {
  if (mode === 'dom' || !c.eligible) return 'dom';
  if (mode === 'canvas') return 'canvas';
  return load >= AUTO_LOAD || canvasBusy ? 'canvas' : 'dom';
};
