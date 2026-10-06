import { afterEach, describe, expect, it } from 'vitest';

import { create } from '../src/index';
import { findBlockOpen, unescapeText } from '../src/parser/textBlocks';
import { parseScript } from '../src/parser/ScriptParser';
import { parseText } from '../src/parser/TextParser';
import { displayText } from '../src/render/displayText';
import { parseTextModel, printText } from '../src/format/textModel';

const texts = (s: string) => parseText(s).fragments.map((f) => f.text);

describe('whitespace trimming (libass trim_whitespace)', () => {
  it('trims the start and end of the event', () => {
    expect(texts('   Hello   ')).toEqual(['Hello']);
  });
  it('trims around \\N', () => {
    expect(texts('Hello   \\N   World')).toEqual(['Hello\nWorld']);
  });
  it('trims across fragments and keeps the fragments', () => {
    const f = parseText('  {\\b1}  Hello {\\i1} \\N {\\i0} x ').fragments;
    expect(f.map((x) => x.text)).toEqual(['', 'Hello', '\n', 'x']);
    expect(f.length).toBe(4);
  });
  it('keeps inner spaces and no-break spaces (\\h)', () => {
    expect(texts('a   b')).toEqual(['a   b']);
    expect(texts('\\h\\hx\\h')).toEqual(['  x ']);
  });
  it('a drawing counts as content', () => {
    const f = parseText('a {\\p1}m 0 0 l 5 5{\\p0} b').fragments;
    expect(f.map((x) => x.text)).toEqual(['a ', '', ' b']);
  });
  it('TAB becomes a space (and is trimmed at the edges)', () => {
    expect(texts('\ta\tb\t')).toEqual(['a b']);
  });
});

describe('brace escapes', () => {
  it('\\{ and \\} are literal braces, not a block', () => {
    expect(texts('a\\{b\\}c')).toEqual(['a{b}c']);
    expect(texts('a\\{\\b1}c')).toEqual(['a{\\b1}c']); // `}` alone is plain text
  });
  it('a real block after an escape still works', () => {
    const p = parseText('\\{x{\\b1}y');
    expect(p.fragments.map((f) => f.text)).toEqual(['{x', 'y']);
    expect(p.fragments[1].ops).toHaveLength(1);
  });
  it('findBlockOpen skips escaped openers', () => {
    expect(findBlockOpen('a\\{b{c', 0)).toBe(4);
    expect(findBlockOpen('\\{', 0)).toBe(-1);
    expect(unescapeText('\\{\\}\\N\\n\\h\t')).toBe('{}\n   ');
  });
  it('the byte-exact text model agrees on where blocks start', () => {
    const t = 'a\\{b\\}c{\\b1}d';
    expect(printText(parseTextModel(t))).toBe(t);
    const lits = parseTextModel(t).filter((s) => s.k === 'blk');
    expect(lits).toHaveLength(1);
  });
});

describe('Kerning header', () => {
  it('is off unless the script says yes', () => {
    const info = (h: string) => parseScript(`[Script Info]\n${h}\n`).info;
    expect(info('Title: x').kerning).toBe(false);
    expect(info('Kerning: no').kerning).toBe(false);
    expect(info('Kerning: yes').kerning).toBe(true);
  });
});

describe('no extra break opportunities', () => {
  it('a word joiner follows hyphens and slashes inside a fragment only', () => {
    expect(displayText('ab-cd', 0)).toBe('ab-⁠cd');
    expect(displayText('and/or', 0)).toBe('and/⁠or');
    expect(displayText('a- b', 0)).toBe('a- b');
    expect(displayText('Hello!', 0)).toBe('Hello!');
  });
});

afterEach(() => { document.body.innerHTML = ''; });
describe('box CSS', () => {
  const mount = (head: string, wrap = '') => {
    const c = document.createElement('div');
    Object.defineProperty(c, 'clientWidth', { value: 640 });
    Object.defineProperty(c, 'clientHeight', { value: 360 });
    document.body.appendChild(c);
    const text = `[Script Info]\nPlayResX: 640\nPlayResY: 360\n${head}\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,${wrap}hello\n`;
    const par = create({ container: c, subtitle: text, region: 'container' });
    par.renderAt(1);
    const box = c.querySelector<HTMLElement>('.par-box')!;
    return { par, box };
  };
  it('breaks only at spaces and has kerning off by default', () => {
    const { par, box } = mount('Title: x');
    expect(box.style.overflowWrap).toBe('normal');
    expect(box.style.wordBreak).toBe('keep-all');
    expect(box.style.fontKerning).toBe('none');
    par.destroy();
  });
  it('Kerning: yes turns kerning on', () => {
    const { par, box } = mount('Kerning: yes');
    expect(box.style.fontKerning).toBe('auto');
    par.destroy();
  });
});
