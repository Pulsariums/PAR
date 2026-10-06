import type { LineTags } from '../types/script';

/**
 * Merges line-level tags in block order with libass precedence:
 * - `\pos` / `\move` (shared flag), `\org`, `\an` / `\a`, `\fad` / `\fade` (shared flag): FIRST occurrence wins.
 * - rect `\clip` / `\iclip`, `\q`: LAST occurrence wins.
 * - vector `\clip` / `\iclip`: FIRST occurrence wins; it applies together with a rect clip.
 */
export const mergeLineTags = (acc: LineTags, next: LineTags): LineTags => {
  const out: LineTags = { ...acc };
  if (!out.pos && !out.move) {
    if (next.pos) out.pos = next.pos;
    else if (next.move) out.move = next.move;
  }
  if (!out.org && next.org) out.org = next.org;
  if (out.an === undefined && next.an !== undefined) out.an = next.an;
  if (!out.fad && !out.fade) {
    if (next.fad) out.fad = next.fad;
    else if (next.fade) out.fade = next.fade;
  }
  if (next.clip) out.clip = next.clip;
  if (!out.vclip && next.vclip) out.vclip = next.vclip;
  if (next.q !== undefined) out.q = next.q;
  return out;
};
