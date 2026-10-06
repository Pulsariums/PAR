import { DEFAULT_STYLE, findStyle, parseStyle, V4_STYLE_FORMAT, V4P_STYLE_FORMAT } from '../parser/StyleParser';
import { V4_EVENT_FORMAT, V4P_EVENT_FORMAT } from '../parser/EventParser';
import { parseFormat, splitFields } from '../parser/sections';
import { parseTime } from '../parser/TimeParser';
import { KNOWN_SECTIONS } from '../fonts/uudecode';
import type { AssStyle } from '../types/script';

import { scanEventText } from './textScan';
import type { UsedFont } from './types';

const STYLE_SECTIONS = new Set(['v4+ styles', 'v4 styles', 'v4 styles+']);
const MAX_SAMPLE = 8;

/**
 * Streaming scanner for the fonts a script uses. Feed it one line at a time; it keeps only the style table, the aggregated
 * `UsedFont`s and the raw `[Fonts]` lines, never the events. Sections, `Format:` lines, comments, BOM, `*Style` names and
 * Dialogue index numbering follow `parseScript`. Limitation: styles must come before the events (every editor writes them
 * so); a style defined after events is reported in `warnings`.
 */
export class UsageScanner {
  readonly uses = new Map<string, UsedFont>();
  readonly styles = new Map<string, AssStyle>();
  readonly fontLines: string[] = [];
  readonly warnings: string[] = [];
  lines = 0;
  events = 0;
  private section = '';
  private ssa = false;
  private styleFmt: string[] | null = null;
  private eventFmt: string[] | null = null;
  private dialogues = 0;
  private lateStyle = false;

  constructor(private readonly glyphs = true) {}

  feed(raw: string): void {
    const line = this.lines++ === 0 ? raw.replace(/^﻿/, '') : raw;
    if (this.section === 'fonts') { this.fontsLine(line); return; }
    let i = 0;
    while (i < line.length && line.charCodeAt(i) <= 32) i++;
    if (i === line.length || line[i] === ';') return;
    if (line[i] === '[') {
      const m = /^\[(.+)\]$/.exec(line.slice(i).trim());
      if (m) { this.section = m[1].trim().toLowerCase(); return; }
    }
    const colon = line.indexOf(':', i);
    if (colon === -1) return;
    const key = line.slice(i, colon).trim().toLowerCase();
    let v = colon + 1;
    while (v < line.length && /\s/.test(line[v])) v++;
    const value = line.slice(v);
    if (this.section === 'script info') { if (key === 'scripttype') this.ssa = /^v4\.00$/i.test(value.trim()); return; }
    if (STYLE_SECTIONS.has(this.section)) this.style(key, value);
    else if (this.section === 'events') this.event(key, value);
  }

  /** Inside `[Fonts]` every line is data (it may start with `;` or look like `[ab]`) unless it is a known section header. */
  private fontsLine(line: string): void {
    const t = line.trim();
    const h = /^\[([^\]]+)\]$/.exec(t);
    if (h && KNOWN_SECTIONS.has(h[1].trim().toLowerCase())) this.section = h[1].trim().toLowerCase();
    else if (t) this.fontLines.push(t);
  }

  private style(key: string, value: string): void {
    const legacy = this.section === 'v4 styles' || this.ssa;
    if (key === 'format') this.styleFmt = parseFormat(value);
    else if (key === 'style') {
      const fields = this.styleFmt ?? (legacy ? V4_STYLE_FORMAT : V4P_STYLE_FORMAT);
      const s = parseStyle(fields, splitFields(value, fields.length).map((x) => x.trim()), legacy);
      this.styles.set(s.name, s);
      if (this.dialogues > 0 && !this.lateStyle) {
        this.lateStyle = true;
        this.warnings.push('a style is defined after events: the scan assumes styles come first, so fonts may be misattributed');
      }
    }
  }

  private event(key: string, value: string): void {
    if (key === 'format') { this.eventFmt = parseFormat(value); return; }
    if (key !== 'dialogue') return;
    const fields = this.eventFmt ?? (this.ssa ? V4_EVENT_FORMAT : V4P_EVENT_FORMAT);
    const index = this.dialogues++;
    const textIdx = fields.indexOf('text');
    const vals = splitFields(value, fields.length);
    if (textIdx === -1 || vals.length < fields.length) return;
    const [s, e] = [fields.indexOf('start'), fields.indexOf('end')];
    if (!Number.isFinite(parseTime(s < 0 ? '' : vals[s])) || !Number.isFinite(parseTime(e < 0 ? '' : vals[e]))) return;
    const si = fields.indexOf('style');
    const base = findStyle(this.styles, si < 0 ? 'Default' : vals[si]);
    this.events++;
    const touched = new Set<UsedFont>();
    scanEventText(vals[textIdx], base ?? DEFAULT_STYLE, this.styles, this.uses, touched, this.glyphs);
    for (const u of touched) { u.lineCount++; if (u.sample.length < MAX_SAMPLE) u.sample.push(index); }
  }
}
