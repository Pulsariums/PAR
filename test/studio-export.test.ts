import { describe, expect, it } from 'vitest';

import { DEFAULT_FPS, defaultFps, detectFps, exportBlockers, exportName } from '../site/src/studio/exportPlan';

const steps = (fps: number, n = 60, jitter = 0): number[] => Array.from({ length: n }, (_, i) => i / fps + (i % 2 ? jitter : 0));

describe('Studio export plan', () => {
  it('names: <name>.xpar and <name>.<fps>fps.par, only the last extension is replaced', () => {
    expect(exportName('xpar', 'Episode 01.ass', 24)).toBe('Episode 01.xpar');
    expect(exportName('par', 'Episode 01.ass', 24)).toBe('Episode 01.24fps.par');
    expect(exportName('par', 'a.b.c.ssa', 23.976)).toBe('a.b.c.23.976fps.par');
    expect(exportName('par', 'noext', 30)).toBe('noext.30fps.par');
  });

  it('fps default: the user pick, else the detected rate, else 24', () => {
    expect(defaultFps(null, null)).toBe(DEFAULT_FPS);
    expect(defaultFps(null, 29.97)).toBe(29.97);
    expect(defaultFps(60, 29.97)).toBe(60);
    expect(defaultFps(Number.NaN, 25)).toBe(25);
    expect(defaultFps(0, null)).toBe(24);
  });

  it('detects common rates from frame times and snaps NTSC ones', () => {
    for (const f of [23.976, 24, 25, 29.97, 30, 50, 59.94, 60]) expect(detectFps(steps(f))).toBe(f);
    expect(detectFps(steps(24, 60, 0.00002))).toBe(24);
    const ms = (fps: number) => steps(fps, 60).map((x) => Math.round(x * 1000) / 1000);
    expect(detectFps(ms(24))).toBe(24);
    expect(detectFps(ms(23.976))).toBe(23.976);
    expect(detectFps(ms(30))).toBe(30);
  });

  it('refuses to guess from too little or odd data', () => {
    expect(detectFps([])).toBeNull();
    expect(detectFps([0, 0.04, 0.08, 0.12])).toBeNull();
    expect(detectFps(steps(37))).toBeNull();
    expect(detectFps([1, 1, 1, 1, 1])).toBeNull();
  });

  it('only an ASS can be exported; XPAR / PAR are disabled with a reason, never faked', () => {
    expect(exportBlockers('ass')).toEqual({ xpar: null, par: null });
    expect(exportBlockers('xpar').par).toBe('needAss');
    expect(exportBlockers('xpar').xpar).toBe('isXpar');
    expect(exportBlockers('par').par).toBe('isPar');
    expect(exportBlockers(null).xpar).toBe('none');
  });
});
