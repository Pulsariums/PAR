import type { AssEvent, AssStyle, ResetOp, SetOp } from '../types/script';

interface Seen {
  border: boolean;
  blur: boolean;
  translucent: boolean;
  bordered: boolean;
}

/** Walks the ops of an event in order, tracking whether a border / blur / translucent fill can occur. */
const walk = (ev: AssEvent, style: AssStyle, styles: Map<string, AssStyle>): Seen => {
  const seen: Seen = { border: false, blur: false, translucent: false, bordered: false };
  let cur = style;
  let bx = style.outline;
  let by = style.outline;
  let a1 = style.primaryAlpha;
  const note = (): void => {
    if (cur.borderStyle !== 3) seen.bordered = true;
    if (bx > 0 || by > 0) seen.border = true;
    if (a1 !== 0) seen.translucent = true;
  };
  const set = (op: SetOp): void => {
    const v = op.value === null ? null : Number(op.value);
    if (op.key === 'xbord') bx = v === null ? cur.outline : v;
    else if (op.key === 'ybord') by = v === null ? cur.outline : v;
    else if (op.key === 'a1') a1 = v === null ? cur.primaryAlpha : v;
    else if ((op.key === 'blur' || op.key === 'be') && v !== null && v > 0) seen.blur = true;
  };
  const reset = (op: ResetOp): void => {
    cur = op.style === null ? style : styles.get(op.style) ?? style;
    bx = by = cur.outline;
    a1 = cur.primaryAlpha;
  };
  // The state is noted once per fragment and after each `\t` (its target), never between the ops of
  // one block: `{\bord0\blur3}` passes through "border from the style" without ever drawing it.
  for (const f of ev.fragments) {
    for (const op of f.ops) {
      if (op.type === 'set') set(op);
      else if (op.type === 'r') reset(op);
      else {
        for (const o of op.ops) {
          if (o.type === 'set') set(o);
          else reset(o);
        }
        note();
      }
    }
    note();
  }
  return seen;
};

/**
 * True when an event must be drawn as plates (shadow / outline / fill, see `render/plates.ts`):
 * it can have a border and either `\blur`/`\be` (libass blurs the outline bitmap and leaves the fill
 * sharp) or a fill that can be translucent (libass cuts the glyph out of the outline). BorderStyle 3
 * is drawn as one element. Decided once per event from its tags and the styles it can reach
 * (`\t` targets count as reachable).
 */
export const isPlated = (ev: AssEvent, style: AssStyle, styles: Map<string, AssStyle>): boolean => {
  const s = walk(ev, style, styles);
  return s.bordered && s.border && (s.blur || s.translucent);
};
