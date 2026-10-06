import type { Fragment, LineTags, StateOp } from '../types/script';

import { parseDrawing } from './DrawingParser';
import { KaraokeTracker } from './KaraokeTracker';
import { mergeLineTags } from './LineTags';
import { parseBlock } from './TagParser';
import { findBlockOpen, unescapeText } from './textBlocks';
import { trimLines } from './trimLines';

export interface ParsedText {
  fragments: Fragment[];
  lineTags: LineTags;
  unknownTags: string[];
}

export { unescapeText };

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

  const text = (part: string): void => {
    if (!part) return;
    const frag: Fragment = { text: '', ops, drawingScale, karaoke: kara.take() };
    if (drawingScale > 0) frag.drawing = parseDrawing(part);
    else frag.text = unescapeText(part);
    if (!frag.karaoke) delete frag.karaoke;
    fragments.push(frag);
    ops = [];
  };
  let pos = 0;
  while (pos < rawText.length) {
    const open = findBlockOpen(rawText, pos);
    const close = open === -1 ? -1 : rawText.indexOf('}', open + 1);
    if (close === -1) {
      text(rawText.slice(pos)); // no (more) closed block: the rest, `{` included, is plain text
      break;
    }
    text(rawText.slice(pos, open));
    const blk = parseBlock(rawText.slice(open, close + 1));
    for (const op of blk.ops) ops.push(op); // push, never concat: `{\b1}` x 80 000 must stay linear
    if (blk.drawing !== undefined) drawingScale = blk.drawing;
    lineTags = mergeLineTags(lineTags, blk.line);
    kara.apply(blk.kara);
    for (const u of blk.unknown) unknownTags.push(u);
    pos = close + 1;
  }
  trimLines(fragments);
  return { fragments, lineTags, unknownTags };
};
