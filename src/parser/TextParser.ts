import { SOFT_BREAK, type Fragment, type LineTags, type StateOp } from '../types/script';

import { parseDrawing } from './DrawingParser';
import { KaraokeTracker, splitSyllables } from './KaraokeTracker';
import { mergeLineTags } from './LineTags';
import { parseBlock } from './TagParser';

export interface ParsedText {
  fragments: Fragment[];
  lineTags: LineTags;
  unknownTags: string[];
}

const BLOCK_RE = /^\{[^}]*\}$/;

/** `\N` => newline, `\n` => soft break, `\h` => non-breaking space. Other backslashes stay literal. */
export const unescapeText = (s: string): string =>
  s.replace(/\\([Nnh])/g, (_m, c: string) => (c === 'N' ? '\n' : c === 'n' ? SOFT_BREAK : ' '));

/**
 * Event text => fragments + line tags. Deterministic and pure.
 * Each fragment carries the ordered state ops of the override blocks directly before it;
 * the full state of fragment N is the fold of fragments 0..N ops over the style.
 */
export const parseText = (rawText: string): ParsedText => {
  const fragments: Fragment[] = [];
  const kara = new KaraokeTracker();
  let lineTags: LineTags = {};
  let ops: StateOp[] = [];
  let drawingScale = 0;
  const unknownTags: string[] = [];

  for (const part of rawText.split(/(\{[^}]*\})/g)) {
    if (!part) continue;
    if (BLOCK_RE.test(part)) {
      const blk = parseBlock(part);
      ops = ops.concat(blk.ops);
      if (blk.drawing !== undefined) drawingScale = blk.drawing;
      lineTags = mergeLineTags(lineTags, blk.line);
      kara.apply(blk.kara);
      unknownTags.push(...blk.unknown);
      continue;
    }
    const frag: Fragment = { text: '', ops, drawingScale, karaoke: kara.take() };
    if (drawingScale > 0) frag.drawing = parseDrawing(part);
    else frag.text = unescapeText(part);
    if (!frag.karaoke) delete frag.karaoke;
    fragments.push(frag);
    ops = [];
  }
  splitSyllables(fragments);
  return { fragments, lineTags, unknownTags };
};
