import { describe, expect, it } from 'vitest';

import { lexOverrides } from '../src/parser/TagLexer';
import { parseBlock, parseTransition } from '../src/parser/TagParser';
import { resolveTagName } from '../src/parser/TagTable';
import { parseText } from '../src/parser/TextParser';
import { SOFT_BREAK, type SetOp } from '../src/types/script';

describe('tag lexer', () => {
  it('keeps nested parentheses of \\t as one tag', () => {
    const tags = lexOverrides('\\fs20\\t(0,500,\\clip(0,0,10,10)\\fs60)\\b1');
    expect(tags.map((t) => t.name)).toEqual(['fs', 't', 'b']);
    expect(tags[1].arg).toBe('0,500,\\clip(0,0,10,10)\\fs60');
  });

  it('uses the longest matching tag name', () => {
    expect(resolveTagName('fscx120')).toBe('fscx');
    expect(resolveTagName('fsp3')).toBe('fsp');
    expect(resolveTagName('fs40')).toBe('fs');
    expect(resolveTagName('alpha&H80&')).toBe('alpha');
    expect(resolveTagName('an8')).toBe('an');
    expect(resolveTagName('be1')).toBe('be');
    expect(resolveTagName('fade(1,2,3,4,5,6,7)')).toBe('fade');
    expect(resolveTagName('fad(1,2)')).toBe('fad');
  });

  it('does not decay a function tag without parentheses into a shorter tag', () => {
    expect(resolveTagName('clipfoo')).toBeNull();
    const tags = lexOverrides('\\posx\\foo3\\i1');
    expect(tags.map((t) => t.name)).toEqual([null, null, 'i']);
  });

  it('extends an unclosed parenthesis to the block end', () => {
    const tags = lexOverrides('\\pos(10,20');
    expect(tags).toHaveLength(1);
    expect(parseBlock('{\\pos(10,20}').line.pos).toEqual([10, 20]);
  });

  it('accepts spaces and parenthesized simple arguments', () => {
    const ops = parseBlock('{\\fs 30\\blur(2)}').ops as SetOp[];
    expect(ops.map((o) => [o.key, o.value])).toEqual([['fs', 30], ['blur', 2]]);
  });
});

describe('tag values', () => {
  it('expands \\bord/\\shad/\\alpha and normalizes colours', () => {
    const ops = parseBlock('{\\bord3\\shad-2\\alpha&H80&\\c&H0000FF&\\3c&HFF\\1a&HFF&}').ops as SetOp[];
    const m = Object.fromEntries(ops.map((o) => [o.key, o.value]));
    expect(m).toMatchObject({ xbord: 3, ybord: 3, xshad: 0, yshad: 0, a2: 0x80, a4: 0x80, c1: 0x0000ff, c3: 0xff });
    expect(m.a1).toBe(0xff); // the later \1a wins over \alpha
  });

  it('maps the long \\alpha bytes to primary/secondary/border/shadow like libass', () => {
    const ops = parseBlock('{\\alpha&H80402010&}').ops as SetOp[];
    const m = Object.fromEntries(ops.map((o) => [o.key, o.value]));
    expect(m).toMatchObject({ a1: 0x10, a2: 0x20, a3: 0x40, a4: 0x80 }); // RR GG BB AA, not the low byte four times
  });

  it('treats argument-less tags as "revert to style"', () => {
    const ops = parseBlock('{\\fs\\c\\fn}').ops as SetOp[];
    expect(ops.map((o) => o.value)).toEqual([null, null, null]);
  });

  it('marks relative font sizes', () => {
    const [op] = parseBlock('{\\fs+2}').ops as SetOp[];
    expect(op).toMatchObject({ key: 'fs', value: 2, relative: true });
  });

  it('records unknown tags and \\r resets in order', () => {
    const b = parseBlock('{\\xyz1\\rSign\\fs10\\r}');
    expect(b.unknown).toEqual(['\\xyz1']);
    expect(b.ops.map((o) => o.type)).toEqual(['r', 'set', 'r']);
    expect(b.ops[0]).toEqual({ type: 'r', style: 'Sign' });
    expect(b.ops[2]).toEqual({ type: 'r', style: null });
  });
});

describe('\\t parsing', () => {
  it('accepts all four argument forms', () => {
    expect(parseTransition('\\fs60')).toMatchObject({ t1: 0, t2: null, accel: 1 });
    expect(parseTransition('2,\\fs60')).toMatchObject({ t1: 0, t2: null, accel: 2 });
    expect(parseTransition('100,500,\\fs60')).toMatchObject({ t1: 100, t2: 500, accel: 1 });
    expect(parseTransition('100,500,0.5,\\fs60')).toMatchObject({ t1: 100, t2: 500, accel: 0.5 });
  });

  it('collects several tags, a clip rect, and ignores nested \\t', () => {
    const tr = parseTransition('0,1000,\\1c&H00FF00&\\frz90\\clip(0,0,100,50)\\t(\\fs1)')!;
    expect(tr.ops.map((o) => (o as { key: string }).key)).toEqual(['c1', 'frz']);
    expect(tr.clip).toEqual([0, 0, 100, 50]);
  });

  it('rejects malformed transitions', () => {
    expect(parseTransition('0,500')).toBeNull();
    expect(parseTransition('a,b,\\fs1')).toBeNull();
    expect(parseBlock('{\\t(1,2,3,4,\\fs1)}').unknown).toHaveLength(1);
  });
});

describe('text parser', () => {
  it('splits fragments and unescapes \\N, \\n and \\h', () => {
    const p = parseText('{\\b1}A\\NB{\\b0}C\\nD\\hE');
    expect(p.fragments.map((f) => f.text)).toEqual(['A\nB', `C${SOFT_BREAK}D E`]);
    expect(p.fragments[0].ops).toHaveLength(1);
  });

  it('parses \\p drawings and leaves the drawing mode with \\p0', () => {
    const p = parseText('{\\p1}m 0 0 l 10 0 10 10{\\p0}text');
    expect(p.fragments[0].drawingScale).toBe(1);
    expect(p.fragments[0].drawing?.map((c) => c.cmd)).toEqual(['m', 'l', 'l']);
    expect(p.fragments[1].drawingScale).toBe(0);
    expect(p.fragments[1].text).toBe('text');
  });

  it('treats an unclosed brace as text', () => {
    expect(parseText('a{b').fragments.map((f) => f.text)).toEqual(['a{b']);
  });
});
