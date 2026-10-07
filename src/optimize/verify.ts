import { evalStates, prepareLine } from '../anim/Prepared';
import { positionAt } from '../anim/LineAnim';
import type { TextState } from '../anim/State';
import { parseDialogue, V4P_EVENT_FORMAT } from '../parser/EventParser';
import type { AssStyle, ScriptInfo } from '../types/script';

import { allowed, type Geo, type Kind } from './tolerance';
import type { OptimizeMode } from './types';

const KEYS: Array<[keyof TextState, Kind]> = [
  ['fs', 'fs'], ['fscx', 'scale'], ['fscy', 'scale'], ['fsp', 'spacing'], ['frx', 'angle'], ['fry', 'angle'], ['frz', 'angle'],
  ['fax', 'shear'], ['fay', 'shear'], ['xbord', 'len'], ['ybord', 'len'], ['xshad', 'len'], ['yshad', 'len'], ['blur', 'blur'], ['be', 'blur'],
  ['a1', 'alpha'], ['a2', 'alpha'], ['a3', 'alpha'], ['a4', 'alpha'],
];
const COLOURS: Array<keyof TextState> = ['c1', 'c2', 'c3', 'c4'];

export interface Context { styles: Map<string, AssStyle>; info: ScriptInfo; geo: Geo; mode: OptimizeMode }

/** A Dialogue line (with its `Dialogue: ` prefix) as PAR would parse it. */
const parse = (line: string, index: number) => {
  const ev = parseDialogue(V4P_EVENT_FORMAT, line.slice('Dialogue: '.length), index);
  return typeof ev === 'string' ? null : ev;
};

/**
 * Compares what PAR draws for the original lines and for the merged line on every frame the merged line covers, with PAR's own
 * evaluation (`evalStates`, `positionAt`: the same code the renderer runs). Returns the largest error as a share of what is allowed
 * (<= 1 passes); Infinity when the lines do not parse or one is positioned and the other not.
 */
export const worstError = (
  originals: ReadonlyArray<{ line: string; frames: readonly number[] }>, merged: string, ctx: Context,
): number => {
  const m = parse(merged, 0);
  if (!m) return Infinity;
  const pm = prepareLine(m, ctx.styles, ctx.info);
  let worst = 0;
  originals.forEach(({ line, frames }, i) => {
    const o = parse(line, i + 1);
    if (!o) { worst = Infinity; return; }
    const po = prepareLine(o, ctx.styles, ctx.info);
    for (const t of frames) {
      const so = evalStates(po, t - Math.round(o.start * 1000), ctx.styles)[0];
      const sm = evalStates(pm, t - Math.round(m.start * 1000), ctx.styles)[0];
      for (const [k, kind] of KEYS) {
        const a = so[k] as number, b = sm[k] as number;
        worst = Math.max(worst, Math.abs(a - b) / allowed(kind, a, ctx.geo, ctx.mode));
      }
      for (const k of COLOURS) {
        const a = so[k] as number, b = sm[k] as number;
        for (let sh = 0; sh <= 16; sh += 8) worst = Math.max(worst, Math.abs(((a >> sh) & 255) - ((b >> sh) & 255)) / allowed('chan', 0, ctx.geo, ctx.mode));
      }
      const pa = positionAt(o.lineTags, t - Math.round(o.start * 1000), po.durationMs);
      const pb = positionAt(m.lineTags, t - Math.round(m.start * 1000), pm.durationMs);
      if (!pa !== !pb) worst = Infinity;
      else if (pa && pb) for (let c = 0; c < 2; c++) worst = Math.max(worst, Math.abs(pa[c] - pb[c]) / allowed('pos', pa[c], ctx.geo, ctx.mode));
    }
  });
  return worst;
};
