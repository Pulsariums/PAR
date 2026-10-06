import { Batcher, cs, frameStart, header, n, rng, type BenchProfile } from './bench-common';

const GLYPHS = ['●', '★', '✦', '◆', '♪', 'Pulsar'];

interface Particle {
  born: number;
  life: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  spin: number;
  s0: number;
  sq: number;
  colour: string;
  glyph: string;
  blur: string;
}

/**
 * Profile (a): karaoke-effect style particles. Every particle is one line PER VIDEO FRAME with
 * \pos + \fscx/\fscy + \frz + \alpha changing a little each frame. Output is sorted by start time (the
 * order Aegisub writes), so lines of one particle are separated by every other particle of that frame.
 */
const make = (id: string, fps: number, active: number, seconds: number): BenchProfile => ({
  id,
  title: `per-frame text particles @${fps} fps (~${active} active)`,
  fps,
  seconds,
  *generate(secs: number, seed: number) {
    const r = rng(seed);
    const b = new Batcher();
    yield header(id);
    const frames = Math.round(secs * fps);
    const avgLife = fps * 1.6;
    const live: Particle[] = [];
    const spawn = (k: number): Particle => ({
      born: k,
      life: Math.round(avgLife * (0.5 + r())),
      x: 200 + r() * 1520,
      y: 150 + r() * 780,
      vx: (r() - 0.5) * 140 / fps * 4,
      vy: -(r() * 90 + 20) / fps * 3,
      g: 0.9 / fps,
      spin: (r() - 0.5) * 360 / fps / 2,
      s0: 60 + r() * 90,
      sq: 0.85 + r() * 0.3,
      colour: Math.floor(r() * 0xffffff).toString(16).toUpperCase().padStart(6, '0'),
      glyph: GLYPHS[Math.floor(r() * GLYPHS.length)],
      blur: n(0.4 + Math.floor(r() * 4) * 0.4, 1),
    });
    for (let k = 0; k < frames; k++) {
      const want = active / avgLife;
      let births = Math.floor(want);
      if (r() < want - births) births++;
      for (let i = 0; i < births; i++) live.push(spawn(k));
      const t0 = cs(frameStart(k, fps));
      const t1 = cs(frameStart(k + 1, fps));
      for (let i = 0; i < live.length; ) {
        const p = live[i];
        const a = k - p.born;
        if (a >= p.life) {
          live.splice(i, 1);
          continue;
        }
        const u = a / p.life;
        const x = p.x + p.vx * a;
        const y = p.y + p.vy * a + p.g * a * a / 2 * 60;
        const sc = p.s0 * (1 - u * 0.7);
        const alpha = u < 0.15 ? Math.round(255 * (1 - u / 0.15)) : u > 0.7 ? Math.round(255 * (u - 0.7) / 0.3) : 0;
        const line = `Dialogue: 0,${t0},${t1},Particle,,0,0,0,,{\\an5\\pos(${n(x)},${n(y)})\\fscx${n(sc)}\\fscy${n(sc * p.sq)}\\frz${n(p.spin * a)}\\alpha&H${alpha.toString(16).toUpperCase().padStart(2, '0')}&\\bord0\\blur${p.blur}\\1c&H${p.colour}&}${p.glyph}`;
        const out = b.push(line);
        if (out) yield out;
        i++;
      }
    }
    if (b.pending) yield b.take();
  },
});

export const textParticles60 = make('a-text-60', 60, 320, 60);
export const textParticles24 = make('a-text-24', 24, 320, 60);
