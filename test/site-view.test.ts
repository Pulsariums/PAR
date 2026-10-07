import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildSnippet } from '../site/src/player/snippet';
import { isView, loadView, onViewRequest, requestView, saveView, viewFromHash } from '../site/src/view';

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('studio views', () => {
  it('maps the deep links: lab asks for the lab view, everything else says nothing', () => {
    expect(viewFromHash('#lab')).toBe('lab');
    expect(viewFromHash('#lab-root')).toBe('lab');
    expect(viewFromHash('#studio')).toBeNull();
    expect(viewFromHash('#studio-root')).toBeNull();
    expect(viewFromHash('')).toBeNull();
  });

  it('remembers the view, defaults to watch and ignores junk', () => {
    expect(loadView()).toBe('watch');
    saveView('lab');
    expect(loadView()).toBe('lab');
    localStorage.setItem('par.view', 'nonsense');
    expect(loadView()).toBe('watch');
    expect(isView('lab') && isView('watch') && !isView('x')).toBe(true);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(loadView()).toBe('watch');
    expect(() => saveView('lab')).not.toThrow();
  });

  it('delivers a request made before the studio listened, and later ones', () => {
    requestView('lab');
    const got: string[] = [];
    onViewRequest((v) => got.push(v));
    expect(got).toEqual(['lab']);
    requestView('watch');
    expect(got).toEqual(['lab', 'watch']);
  });
});

describe('generated code', () => {
  const base = { hasVideo: true, fps: 'auto' as const, videoFps: null, timeOffset: 0, renderMode: 'auto' as const };

  it('omits defaults and names the video or the clock', () => {
    const v = buildSnippet(base);
    expect(v).toContain("video: document.querySelector('video')");
    expect(v).not.toMatch(/fps|timeOffset|renderMode/);
    expect(buildSnippet({ ...base, hasVideo: false })).toContain('clock: () => myPlayer.currentTime');
  });

  it('lists what the Studio changed', () => {
    const v = buildSnippet({ ...base, fps: 30, videoFps: 23.976, timeOffset: -0.5, renderMode: 'canvas' });
    expect(v).toContain('fps: 30,');
    expect(v).toContain('videoFps: 23.976,');
    expect(v).toContain('timeOffset: -0.5,');
    expect(v).toContain("renderMode: 'canvas',");
  });
});
