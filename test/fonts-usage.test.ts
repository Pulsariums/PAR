import { describe, expect, it } from 'vitest';

import { prepareLine } from '../src/anim/Prepared';
import { collectUsage } from '../src/fonts/usage';
import { parseScript } from '../src/parser/ScriptParser';

const SCRIPT = `[Script Info]
PlayResX: 384
PlayResY: 288

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Base Font,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1
Style: Sign,@Sign Font,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,1,0,0,100,100,0,0,1,2,0,2,10,10,10,1
Style: Unused,Never Used,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,plain {\\fnInline Font\\b1}inline{\\r} back {\\rSign}sign
Dialogue: 0,0:00:00.00,0:00:01.00,Sign,,0,0,0,,{\\p1}m 0 0 l 10 0 10 10{\\p0}   
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\fnsign font}again
`;

describe('font usage', () => {
  const s = parseScript(SCRIPT);
  const usage = collectUsage(s.events.map((e) => prepareLine(e, s.styles, s.info)), s.styles);

  it('finds fonts from styles, \\fn, \\r<style> and ignores drawings, blank text and unused styles', () => {
    expect([...usage.keys()].sort()).toEqual(['base font', 'inline font', 'sign font']);
    expect(usage.has('never used')).toBe(false);
  });

  it('records styles, event indices and the bold/italic looks per font', () => {
    const sign = usage.get('sign font')!;
    expect(sign.name).toBe('Sign Font'); // @ removed, first spelling kept
    expect([...sign.lines]).toEqual([0, 2]);
    expect([...sign.styles].sort()).toEqual(['Default', 'Sign']);
    // style Sign (bold italic) via \r, and Default (plain) with a bare \fn on line 2
    expect([...sign.looks.values()]).toEqual([{ b: -1, i: true }, { b: 0, i: false }]);
    expect([...usage.get('inline font')!.looks.values()]).toEqual([{ b: 1, i: false }]);
  });
});
