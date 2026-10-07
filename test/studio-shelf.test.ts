import { describe, expect, it } from 'vitest';

import { classifyFiles } from '../site/src/player/dnd';
import { Shelf } from '../site/src/studio/shelfState';

const item = (id: string) => ({ id });
const file = (name: string, type = '') => new File(['x'], name, { type });

describe('Studio shelf state', () => {
  it('the first added item is selected, later ones do not steal the selection', () => {
    const s = new Shelf<{ id: string }>();
    s.add([item('a'), item('b')]);
    s.add([item('c')]);
    expect(s.selectedId).toBe('a');
    expect(s.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('selecting is ignored for unknown ids and reports a change only when it happened', () => {
    const s = new Shelf<{ id: string }>();
    s.add([item('a'), item('b')]);
    expect(s.select('nope')).toBe(false);
    expect(s.select('a')).toBe(false);
    expect(s.select('b')).toBe(true);
    expect(s.selectedId).toBe('b');
  });

  it('removing the selected item moves to the next, else the previous, else nothing', () => {
    const s = new Shelf<{ id: string }>();
    s.add([item('a'), item('b'), item('c')]);
    s.select('b');
    s.remove('b');
    expect(s.selectedId).toBe('c');
    s.remove('c');
    expect(s.selectedId).toBe('a');
    s.remove('a');
    expect(s.selectedId).toBeNull();
    expect(s.remove('zzz')).toBeNull();
  });

  it('removing an unselected item keeps the selection', () => {
    const s = new Shelf<{ id: string }>();
    s.add([item('a'), item('b')]);
    s.remove('b');
    expect(s.selectedId).toBe('a');
  });

  it('video and subtitle shelves are independent', () => {
    const videos = new Shelf<{ id: string }>();
    const subs = new Shelf<{ id: string }>();
    let subEvents = 0;
    subs.subscribe(() => subEvents++);
    videos.add([item('v1'), item('v2')]);
    subs.add([item('s1'), item('s2')]);
    subs.select('s2');
    const before = subEvents;
    videos.select('v2');
    videos.remove('v2');
    expect(subs.selectedId).toBe('s2');
    expect(subEvents).toBe(before);
    subs.select('s1');
    expect(videos.selectedId).toBe('v1');
  });

  it('classifies dropped files: fonts win, subtitles by extension, videos by type or extension', () => {
    const c = classifyFiles([file('a.ttf'), file('b.ass'), file('c.xpar'), file('d.mkv'), file('e.bin', 'video/webm'), file('f.txt'), file('g.png')], /\.(ass|ssa|txt|xpar|par)$/i);
    expect(c.fonts.map((f) => f.name)).toEqual(['a.ttf']);
    expect(c.subs.map((f) => f.name)).toEqual(['b.ass', 'c.xpar', 'f.txt']);
    expect(c.videos.map((f) => f.name)).toEqual(['d.mkv', 'e.bin']);
  });
});
