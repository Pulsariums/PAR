/** Stream keys shared by the text encoder/decoder and the event-column coder. */
export const K = {
  OPS: 1, TAG: 2, LIT: 3, CNT: 5, HEX: 6, SHP: 7, VERB: 9, 
  KIND: 16, LINE: 17, ORD: 18, LAYER: 19, START: 20, DUR: 21, STYLE: 22, NAME: 23, EFFECT: 24, MARGIN: 25,
  RAW: 26, FMT: 27,
} as const;

/** Slot keys (delta streams are `KEY_DELTA + key`): tags use `id*8+arg`, nested `\t` tags add NEST_KEY. */
export const DRAW_KEY = 1000;
export const NEST_KEY = 512;
/** Per-slot decimal-count streams live at DEC_BASE + slot (delta streams at KEY_DELTA + slot). */
export const DEC_BASE = 4096;

export const mix = (sig: number, v: number): number => Math.imul(sig ^ v, 16777619) >>> 0;
