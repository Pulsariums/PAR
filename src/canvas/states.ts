import { evalStates, type PreparedLine } from '../anim/Prepared';
import type { TextState } from '../anim/State';
import type { AssStyle, StateOp } from '../types/script';

import { ByteLru } from '../util/ByteLru';

/**
 * Bounded cache of `evalStates` results for the canvas path.
 *
 * `evalStates(line, t, styles)` is a pure function of the line's time-independent inputs (its style, its duration and the ordered ops
 * of its fragments), the `styles` map it resets to (`\r<name>`) and the quantized time `t` (integer ms since line start). Dense endings
 * reuse that result across:
 *  - frames of the same event (the warm pass samples a line's rel times, then the draw pass asks for the same ones), and
 *  - events with identical tag lists and geometry (same canonicalized op signature, same duration, same styles map).
 *
 * The result is a fresh `TextState` object that the canvas path only reads (`buildSpec`, `xRatio`, `targetValue` read fields, never the
 * `style` object identity), so sharing it between equal inputs is byte-exact: equal inputs produce a byte-identical `TextState`. The key
 * embeds an id of the styles map and the line signature, so a script / font change (a new styles map) or a layout change simply misses
 * (and `reset` clears the cache outright for the explicit invalidation contract).
 */

/** Ids for `styles` maps and `AssStyle` objects, so the structural key is short and exact. */
const mapIds = new WeakMap<object, number>();
let nextMapId = 0;
const idOf = (o: object): number => {
  let i = mapIds.get(o);
  if (i === undefined) mapIds.set(o, (i = ++nextMapId));
  return i;
};

/**
 * Canonical text of one op; recurses into `\t`. Numbers are parser-exact; `\r` names resolve through the styles map, whose id is part
 * of the cache key, so the name alone identifies the reset target. A transition's `\clip` target is not read by `evalStates` (only by
 * `clipAt`, on its own path), but it is included so the signature stays conservative for any future reader of the state.
 */
/**
 * Strings (`\fn` names, `\r` targets, ...) are JSON-quoted so a value containing the `,` `;` `:` `|` separators cannot forge an op
 * boundary (`{\fnA,sfs:5}` vs `{\fnA\fs5}`); numbers and `null` stay bare, which also keeps `5` and `"5"` distinct.
 */
const valSig = (v: number | string | null): string => (typeof v === 'string' ? JSON.stringify(v) : v === null ? 'n' : String(v));

const opSig = (o: StateOp): string => {
  if (o.type === 'r') return `r${o.style === null ? 'n' : JSON.stringify(o.style)}`;
  if (o.type === 'set') return `s${o.key}:${valSig(o.value)}${o.relative ? '~' : ''}`;
  const clip = o.clip ? `c${o.clip.join(',')}` : '';
  return `t${o.t1}:${o.t2 === null ? 'n' : o.t2}:${o.accel}:${o.ops.map(opSig).join(',')}[${clip}]`;
};

/** Line structure independent of time: duration, base style and the ordered ops of every fragment. Memoized per `PreparedLine`. */
const sigs = new WeakMap<PreparedLine, string>();
export const lineSig = (line: PreparedLine): string => {
  let s = sigs.get(line);
  if (s === undefined) {
    const base = idOf(line.style);
    const ops = line.event.fragments.map((f) => f.ops.map(opSig).join(',')).join(';');
    s = `${line.durationMs}|${base}|${ops}`;
    sigs.set(line, s);
  }
  return s;
};

/** Rough bytes a cached entry holds (one TextState plus its key string); the cap bounds total memory, not exact accounting. */
const ENTRY_BYTES = 512;
const estimateBytes = (states: TextState[]): number => ENTRY_BYTES * states.length;

const cache = new ByteLru<string, TextState[]>(16 << 20);

/** The states of `line` at integer-ms `t`, evaluated once per distinct (structure, styles-map, t) for the whole canvas pass. */
export const cachedStates = (line: PreparedLine, t: number, styles: Map<string, AssStyle>): TextState[] => {
  const key = `${idOf(styles)}|${lineSig(line)}|${t}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const states = evalStates(line, t, styles);
  cache.set(key, states, estimateBytes(states));
  return states;
};

/** Script / font / layout changed: drop every cached evaluation (explicit invalidation contract). */
export const resetStates = (): void => cache.clear();
