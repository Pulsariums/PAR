import { msOf } from '../core/time';
import { V4P_EVENT_FORMAT, V4_EVENT_FORMAT, parseDialogue } from '../parser/EventParser';
import { parseScript } from '../parser/ScriptParser';
import { parseFormat, splitKeyValue } from '../parser/sections';
import type { SourceScript, SubtitleSource } from '../source/types';
import type { AssEvent } from '../types/script';

const sectionOf = (line: string): string | null => {
  const t = line.trim();
  return t.startsWith('[') && t.endsWith(']') ? t.slice(1, -1).trim().toLowerCase() : null;
};

/** Lines of `text` one at a time (no split of the whole file: a 100 MB script is hundreds of thousands of lines). */
function* lines(text: string): Generator<string> {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < text.length) {
    let j = text.indexOf('\n', i);
    if (j < 0) j = text.length;
    yield text.slice(i, text[j - 1] === '\r' ? j - 1 : j);
    i = j + 1;
  }
}

export interface AssHead {
  script: SourceScript;
  /** Event `Format:` fields (lower case). */
  fields: string[];
}

/** Everything but the Dialogue lines: `[Script Info]`, styles and the event format. Embedded fonts and graphics are skipped. */
export const readHead = (text: string): AssHead => {
  const keep: string[] = [];
  let sec = '';
  let format: string | null = null;
  for (const l of lines(text)) {
    const s = sectionOf(l);
    if (s !== null) { sec = s; if (s !== 'fonts' && s !== 'graphics' && s !== 'events') keep.push(l); continue; }
    if (sec === 'fonts' || sec === 'graphics') continue;
    if (sec !== 'events') { keep.push(l); continue; }
    const kv = splitKeyValue(l.trimStart());
    if (kv && kv[0].toLowerCase() === 'format' && format === null) format = kv[1];
  }
  const parsed = parseScript(keep.join('\n'));
  const ssa = /^v4\.00$/i.test(parsed.info.scriptType.trim());
  return { script: { info: parsed.info, styles: parsed.styles, warnings: parsed.warnings }, fields: format ? parseFormat(format) : ssa ? V4_EVENT_FORMAT : V4P_EVENT_FORMAT };
};

/** A Dialogue line as the event `parseScript` would give it (same `index`), plus the raw line. Comments and other lines are skipped. */
export function* dialogues(text: string, fields: string[]): Generator<{ ev: AssEvent; line: string }> {
  let sec = '';
  let n = 0;
  for (const l of lines(text)) {
    const s = sectionOf(l);
    if (s !== null) { sec = s; continue; }
    if (sec !== 'events') continue;
    const t = l.trimStart();
    if (t.charCodeAt(0) !== 68 /* D */ || !/^dialogue\s*:/i.test(t)) continue;
    const kv = splitKeyValue(t);
    if (!kv) continue;
    const ev = parseDialogue(fields, kv[1], n++);
    if (typeof ev !== 'string') yield { ev, line: t };
  }
}

/** Events of a source whose start lies in each window of `step` seconds, so events that span windows are seen once. */
export async function* windows(source: SubtitleSource, step: number, signal?: AbortSignal): AsyncGenerator<AssEvent> {
  for (let t0 = 0; t0 < source.duration + step; t0 += step) {
    if (signal?.aborted) return;
    const a = msOf(t0), b = msOf(t0 + step);
    for (const ev of await source.readWindow(t0, t0 + step, signal)) {
      const s = msOf(ev.start);
      if (s >= a && s < b) yield ev;
    }
  }
}
