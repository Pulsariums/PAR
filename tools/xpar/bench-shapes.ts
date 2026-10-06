import { Batcher, cs, frameStart, header, n, rng, type BenchProfile } from './bench-common';

/**
 * Profile (b): per-frame vector drawings. Each shape is one `\p1` drawing per frame whose control points
 * wobble slowly (tracked/morphing shapes), with an animated rect \clip, \pos and now and then a \t / \move
 * that only lives for one frame.
 */
export const vectorShapes24: BenchProfile = {
  id: 'b-draw-24',
  title: 'per-frame vector drawings @24 fps (~200 shapes)',
  fps: 24,
  seconds: 60,
  *generate(secs: number, seed: number) {
    const r = rng(seed);
    const b = new Batcher();
    yield header('b-draw-24');
    const fps = 24;
    const shapes = Array.from({ length: 200 }, () => {
      const pts = 8 + Math.floor(r() * 12);
      return {
        x: 150 + r() * 1600,
        y: 120 + r() * 800,
        rad: 40 + r() * 120,
        pts,
        ph: Array.from({ length: pts }, () => r() * 6.28),
        w: 0.08 + r() * 0.12,
        colour: Math.floor(r() * 0xffffff).toString(16).toUpperCase().padStart(6, '0'),
        start: Math.floor(r() * fps * 8),
        life: Math.floor(fps * (4 + r() * 20)),
        t: r() < 0.1,
      };
    });
    const frames = Math.round(secs * fps);
    for (let k = 0; k < frames; k++) {
      const t0 = cs(frameStart(k, fps));
      const t1 = cs(frameStart(k + 1, fps));
      for (const s of shapes) {
        const a = (k - s.start) % (s.life + 30);
        if (a < 0 || a >= s.life) continue;
        let d = 'm';
        for (let i = 0; i < s.pts; i++) {
          const ang = (i / s.pts) * 6.2832;
          const rr = s.rad * (1 + 0.18 * Math.sin(s.ph[i] + s.w * k));
          d += ` ${n(Math.cos(ang) * rr + s.rad * 1.4)} ${n(Math.sin(ang) * rr + s.rad * 1.4)}${i === 0 ? ' b' : ''}`;
        }
        d += ' c';
        const cx = s.x + 60 * Math.sin(k * 0.021);
        const cy = s.y + 40 * Math.cos(k * 0.017);
        const clipw = 80 + 70 * Math.abs(Math.sin(k * 0.01));
        const tag = s.t ? `\\t(0,41,\\fscx${n(101 + a * 0.01)}\\fscy${n(101 + a * 0.01)})` : '';
        const line = `Dialogue: 1,${t0},${t1},Shape,,0,0,0,,{\\an7\\pos(${n(cx)},${n(cy)})\\bord0\\blur1\\1c&H${s.colour}&\\clip(${n(cx)},${n(cy - 20)},${n(cx + s.rad * 2.8)},${n(cy + clipw * 3)})${tag}\\p1}${d}`;
        const out = b.push(line);
        if (out) yield out;
      }
    }
    if (b.pending) yield b.take();
  },
};
