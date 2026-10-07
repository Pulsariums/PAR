import { describe, expect, it } from 'vitest';

import { optimizeAss, type OptimizeMode } from '../src/optimize';

import { dump, fbfLines, script, type Shown } from './helpers/fbf';

/** Small seeded generator: failures are reproducible from the seed in the test name. */
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

const TOL: Record<OptimizeMode, { pos: number; deg: number; scale: number; chan: number }> = {
  exact: { pos: 0.0013, deg: 0.0013, scale: 0.0027, chan: 0.5 },
  invisible: { pos: 0.126, deg: 0.13, scale: 0.28, chan: 2 },
  loose: { pos: 0.51, deg: 0.5, scale: 1.1, chan: 4 },
};

/** Events closer than this (script px) cover the same pixels (a two-letter event of this font centred on its anchor reaches ~57 px): only then does their drawing order show. */
const NEAR = 110;

const check = (a: Shown[][], b: Shown[][], mode: OptimizeMode, label: string): void => {
  const tol = TOL[mode];
  expect(b.length).toBe(a.length);
  a.forEach((fa, k) => {
    const fb = b[k];
    const key = (s: Shown): string => `${s.layer}:${s.text}`;
    expect(fb.map(key).sort(), `${label} frame ${k}: same events`).toEqual(fa.map(key).sort());
    const rank = new Map(fb.map((s, i) => [key(s), i]));
    fa.forEach((x, i) => {
      const y = fb[rank.get(key(x))!];
      // drawing order against every event that can overlap it (same layer: other layers are ordered by layer)
      fa.forEach((o, j) => {
        if (j <= i || o.layer !== x.layer || !x.pos || !o.pos || Math.hypot(x.pos[0] - o.pos[0], x.pos[1] - o.pos[1]) > NEAR) return;
        expect((rank.get(key(x))! < rank.get(key(o))!), `${label} order of ${x.text} / ${o.text} @${k}`).toBe(true);
      });
      if (x.pos && y.pos) for (let c = 0; c < 2; c++) expect(Math.abs(x.pos[c] - y.pos[c]), `${label} pos @${k} ${x.text}`).toBeLessThanOrEqual(tol.pos);
      else expect(!!x.pos, `${label} positioned @${k}`).toBe(!!y.pos);
      for (const key2 of ['frz', 'frx', 'fry']) expect(Math.abs(x.st[key2] - y.st[key2]), `${label} ${key2} @${k}`).toBeLessThanOrEqual(tol.deg);
      for (const key2 of ['fscx', 'fscy']) expect(Math.abs(x.st[key2] - y.st[key2]), `${label} ${key2} @${k}`).toBeLessThanOrEqual(tol.scale);
      for (const key2 of ['a1', 'a3']) expect(Math.abs(x.st[key2] - y.st[key2]), `${label} ${key2} @${k}`).toBeLessThanOrEqual(tol.chan);
      for (let sh = 0; sh <= 16; sh += 8) expect(Math.abs(((x.st.c1 >> sh) & 255) - ((y.st.c1 >> sh) & 255)), `${label} c1 @${k}`).toBeLessThanOrEqual(tol.chan);
    });
  });
};

/** A script of several particles, interleaved the way an exporter writes them (frame by frame), sometimes shuffled within a frame. */
const make = (seed: number, dense = false): { src: string; frames: number } => {
  const r = rng(seed);
  const n = 2 + Math.floor(r() * 5);
  const frames = 30 + Math.floor(r() * 50);
  const tracks = Array.from({ length: n }, (_, p) => {
    const from = Math.floor(r() * 10);
    const len = 8 + Math.floor(r() * (frames - from - 8));
    const sx = (r() - 0.5) * 12, sy = (r() - 0.5) * 8, rot = (r() - 0.5) * 3, noise = r() < 0.5 ? 0 : 0.04, curve = r() < 0.4 ? 0.01 + r() * 0.05 : 0;
    const colour = r() < 0.5, fade = r() < 0.5;
    return fbfLines({
      frames: len, from, layer: Math.floor(r() * 2), text: `P${p}`,
      tags: (k) => `\\pos(${(200 + (dense ? 25 : 300) * p + sx * (dense ? 0.2 : 1) * k + curve * k * k + (r() - 0.5) * noise * 2).toFixed(2)},${(300 + sy * k).toFixed(2)})\\frz${(rot * k).toFixed(2)}${colour ? `\\1c&H${Math.min(255, k * 3).toString(16).toUpperCase().padStart(2, '0')}FF00&` : ''}${fade ? `\\1a&H${Math.min(255, k * 5).toString(16).toUpperCase().padStart(2, '0')}&` : ''}`,
    }).map((l, k) => ({ l, k: from + k }));
  });
  const all = tracks.flat();
  all.sort((a, b) => a.k - b.k || (r() < 0.15 ? r() - 0.5 : 0));
  return { src: script(all.map((x) => x.l)), frames: frames + 20 };
};

describe('optimizeAss, seeded scripts (every frame of the result must match the original)', () => {
  const modes: OptimizeMode[] = ['exact', 'invisible', 'loose'];
  for (let seed = 1; seed <= 24; seed++) {
    it(`seed ${seed}`, async () => {
      const { src, frames } = make(seed);
      const before = dump(src, 24, frames);
      for (const mode of modes) {
        const { text, stats } = await optimizeAss(src, { fps: 24, mode });
        expect(stats.eventsOut).toBeLessThanOrEqual(stats.eventsIn);
        check(before, dump(text, 24, frames), mode, `seed ${seed} ${mode}`);
      }
    });
  }

  for (let seed = 101; seed <= 130; seed++) {
    it(`dense seed ${seed} (overlapping events written in changing order)`, async () => {
      const { src, frames } = make(seed, true);
      const before = dump(src, 24, frames);
      for (const mode of ['invisible', 'loose'] as const) {
        const { text } = await optimizeAss(src, { fps: 24, mode });
        check(before, dump(text, 24, frames), mode, `dense ${seed} ${mode}`);
      }
    });
  }

  it('saves lines on typical frame-by-frame input in the default mode', async () => {
    let saved = 0, total = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { src } = make(seed);
      const r = await optimizeAss(src, { fps: 24 });
      saved += r.stats.removed;
      total += r.stats.eventsIn;
    }
    expect(saved / total).toBeGreaterThan(0.3);
  });

  it('is idempotent: optimising the result again changes nothing', async () => {
    const { src } = make(7);
    const once = (await optimizeAss(src, { fps: 24 })).text;
    expect((await optimizeAss(once, { fps: 24 })).text).toBe(once);
  });
});
