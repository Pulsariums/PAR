import { describe, expect, it } from 'vitest';

import { parseScript } from '../src/parser/ScriptParser';
import { resolvePlayRes } from '../src/parser/ScriptInfo';
import { findStyle } from '../src/parser/StyleParser';
import { parseTime } from '../src/parser/TimeParser';

import { SAMPLE } from './fixtures';

describe('file parser', () => {
  const s = parseScript(SAMPLE);

  it('reads [Script Info] through BOM and CRLF', () => {
    expect(s.info.playResX).toBe(1920);
    expect(s.info.playResY).toBe(1080);
    expect(s.info.wrapStyle).toBe(2);
    expect(s.info.scaledBorderAndShadow).toBe(false);
    expect(s.info.raw.Title).toBe('Sample');
  });

  it('parses styles by Format line, including alpha in colours', () => {
    const d = s.styles.get('Default')!;
    expect(d.fontSize).toBe(48);
    expect(d.bold).toBe(-1);
    expect(d.backColour).toBe(0);
    expect(d.backAlpha).toBe(0x80);
    expect(d.marginV).toBe(20);
    const sign = s.styles.get('Sign')!;
    expect(sign.primaryColour).toBe(0x00ffff);
    expect(sign.italic).toBe(true);
    expect(sign.alignment).toBe(7);
  });

  it('keeps commas inside the Text field', () => {
    expect(s.events[0].text).toBe('Hello, world!');
    expect(s.events[0].fragments[0].text).toBe('Hello, world!');
    expect(s.events[0].name).toBe('Alice');
  });

  it('skips Comment lines', () => {
    expect(s.events.map((e) => e.text)).not.toContain('not rendered');
    expect(s.events).toHaveLength(3);
  });

  it('assigns deterministic index-based ids', () => {
    expect(s.events.map((e) => e.id)).toEqual(['0', '1', '2']);
    const again = parseScript(SAMPLE);
    expect(again.events.map((e) => e.id)).toEqual(s.events.map((e) => e.id));
    expect(JSON.stringify(again.events)).toBe(JSON.stringify(s.events));
  });

  it('parses times with integer millisecond arithmetic', () => {
    expect(s.events[1].start).toBe(2.5);
    expect(parseTime('0:00:01.20')).toBe(1.2);
    expect(parseTime('1:02:03.456')).toBe(3723.456);
    expect(Number.isNaN(parseTime('garbage'))).toBe(true);
  });

  it('honours a custom Format order for events', () => {
    const t = parseScript('[Events]\nFormat: Start, End, Text, Style\nDialogue: 0:00:00.00,0:00:01.00,Hi,Default');
    // Text is not last here: the record is still split per field.
    expect(t.events[0].start).toBe(0);
    expect(t.events[0].end).toBe(1);
  });

  it('falls back for unknown styles (Default, then first style)', () => {
    expect(findStyle(s.styles, 'Missing').name).toBe('Default');
    expect(findStyle(s.styles, '*Sign').name).toBe('Sign');
    expect(findStyle(new Map(), 'x').name).toBe('Default');
  });

  it('survives missing sections and reports warnings', () => {
    const t = parseScript('[Events]\nDialogue: 0,bad,0:00:01.00,Default,,0,0,0,,x\nDialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,ok');
    expect(t.events).toHaveLength(1);
    expect(t.events[0].id).toBe('1');
    expect(t.warnings.some((w) => w.includes('invalid time'))).toBe(true);
    expect(t.info.playResX).toBe(384);
    expect(t.styles.size).toBe(0);
    expect(parseScript('').events).toEqual([]);
  });

  it('parses SSA v4 styles (legacy alignment, decimal colours, TertiaryColour)', () => {
    const ssa = parseScript([
      '[Script Info]', 'ScriptType: v4.00',
      '[V4 Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding',
      'Style: Default,Arial,20,16777215,255,65280,0,0,0,1,2,0,6,10,10,10,0,0',
      '[Events]',
      'Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: Marked=0,0:00:00.00,0:00:01.00,Default,,0000,0000,0000,,ssa',
    ].join('\n'));
    const st = ssa.styles.get('Default')!;
    expect(st.alignment).toBe(8); // legacy 6 = top centre
    expect(st.primaryColour).toBe(0xffffff);
    expect(st.outlineColour).toBe(0x00ff00);
    expect(ssa.events[0].text).toBe('ssa');
  });

  it('applies the libass PlayRes fallbacks', () => {
    expect(resolvePlayRes(0, 0)).toEqual({ x: 384, y: 288, fallback: true });
    expect(resolvePlayRes(1280, 0)).toEqual({ x: 1280, y: 1024, fallback: true });
    expect(resolvePlayRes(640, 0)).toEqual({ x: 640, y: 480, fallback: true });
    expect(resolvePlayRes(0, 1024)).toEqual({ x: 1280, y: 1024, fallback: true });
    expect(resolvePlayRes(0, 720)).toEqual({ x: 960, y: 720, fallback: true });
    expect(resolvePlayRes(1920, 1080).fallback).toBe(false);
  });
});
