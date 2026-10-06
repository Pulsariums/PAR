import type { AssEvent, AssStyle, ParsedScript } from '../types/script';

import { V4_EVENT_FORMAT, V4P_EVENT_FORMAT, parseDialogue } from './EventParser';
import { parseScriptInfo } from './ScriptInfo';
import { type Section, parseFormat, splitFields, splitKeyValue, splitSections } from './sections';
import { V4_STYLE_FORMAT, V4P_STYLE_FORMAT, parseStyle } from './StyleParser';

const STYLE_SECTIONS = new Set(['v4+ styles', 'v4 styles', 'v4 styles+']);

/** Returns true when the section's Format line differs from the standard one (libass: custom_format_line_compatibility). */
const parseStyles = (sec: Section, legacy: boolean, styles: Map<string, AssStyle>, warnings: string[]): boolean => {
  const standard = legacy ? V4_STYLE_FORMAT : V4P_STYLE_FORMAT;
  let fields = standard;
  let custom = false;
  for (const line of sec.lines) {
    const kv = splitKeyValue(line.text);
    if (!kv) continue;
    const key = kv[0].toLowerCase();
    if (key === 'format') {
      fields = parseFormat(kv[1]);
      custom = fields.join() !== standard.join();
    } else if (key === 'style') {
      const values = splitFields(kv[1], fields.length).map((v) => v.trim());
      if (values.length < fields.length) warnings.push(`line ${line.lineNo}: style has too few fields`);
      const style = parseStyle(fields, values, legacy);
      styles.set(style.name, style);
    }
  }
  return custom;
};

const parseEvents = (sec: Section, legacy: boolean, events: AssEvent[], counter: { n: number }, warnings: string[]) => {
  let fields = legacy ? V4_EVENT_FORMAT : V4P_EVENT_FORMAT;
  for (const line of sec.lines) {
    const kv = splitKeyValue(line.text);
    if (!kv) continue;
    const key = kv[0].toLowerCase();
    if (key === 'format') fields = parseFormat(kv[1]);
    else if (key === 'dialogue') {
      const index = counter.n++;
      const ev = parseDialogue(fields, kv[1], index);
      if (typeof ev === 'string') warnings.push(`line ${line.lineNo}: dialogue skipped (${ev})`);
      else events.push(ev);
    }
    // `Comment:`, `Picture:`, `Sound:`, `Movie:`, `Command:` lines are never rendered.
  }
};

/**
 * Parses a complete .ass/.ssa file. Never throws: missing sections fall back to defaults and
 * malformed records are reported in `warnings`. Output is deterministic for a given input.
 */
export const parseScript = (text: string): ParsedScript => {
  const sections = splitSections(text);
  const infoSec = sections.find((s) => s.name === 'script info');
  const info = parseScriptInfo(infoSec?.lines ?? []);
  const ssa = /^v4\.00$/i.test(info.scriptType.trim());
  const styles = new Map<string, AssStyle>();
  const events: AssEvent[] = [];
  const warnings: string[] = [];
  const counter = { n: 0 };
  for (const sec of sections) {
    if (STYLE_SECTIONS.has(sec.name) && parseStyles(sec, sec.name === 'v4 styles' || ssa, styles, warnings) && !info.scaledBorderAndShadowSet) {
      info.scaledBorderAndShadow = true;
    } else if (sec.name === 'events') parseEvents(sec, ssa, events, counter, warnings);
  }
  if (!infoSec) warnings.push('missing [Script Info] section');
  return { info, styles, events, warnings };
};
