import { Batcher, cs, header, n, rng, type BenchProfile } from './bench-common';

const WORDS = 'the of and to in is you that it he was for on are as with his they at be this from I have or by one had not but what all were when we there can an your which their said if do will each about how up out them then she many some so these would other into has more her two like him see time could no make than first been its who now people my made over did down only way find use may water long little very after words called just where most know'.split(' ');

/**
 * Profile (c): a normal episode. Dialogue with italics/line breaks/positions, an OP karaoke with
 * \k syllables and templater-style fx lines (\move, \t, \fad, a few hundred ms each), and signs
 * with \pos/\clip/\fad. Nothing here is frame-by-frame.
 */
export const episode: BenchProfile = {
  id: 'c-episode',
  title: 'typical episode (dialogue + karaoke + signs)',
  fps: 24,
  seconds: 24 * 60,
  *generate(secs: number, seed: number) {
    const r = rng(seed);
    const b = new Batcher();
    yield header('c-episode');
    const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)];
    const sentence = (): string => {
      const len = 2 + Math.floor(r() * 9);
      let s = Array.from({ length: len }, () => pick(WORDS)).join(' ');
      s = s[0].toUpperCase() + s.slice(1) + pick(['.', '.', '?', '!', '...']);
      if (r() < 0.12) s = `{\\i1}${s}{\\i0}`;
      if (len > 7 && r() < 0.6) {
        const i = s.indexOf(' ', Math.floor(s.length / 2));
        if (i > 0) s = `${s.slice(0, i)}\\N${s.slice(i + 1)}`;
      }
      return s;
    };
    const out = (line: string): string | null => b.push(line);
    const lines: string[] = [];
    const D = (layer: number, a: number, e: number, style: string, name: string, tags: string, text: string): void => {
      lines.push(`Dialogue: ${layer},${cs(a)},${cs(e)},${style},${name},0,0,0,,${tags}${text}`);
    };
    const kara = Math.min(secs, 90);
    // dialogue
    for (let t = 2; t < secs - 5; ) {
      const dur = 1 + r() * 3.5;
      D(0, t, t + dur, 'Default', r() < 0.3 ? pick(['Alice', 'Bob', 'Carol']) : '', r() < 0.08 ? `{\\an8}` : '', sentence());
      if (r() < 0.15) D(0, t + 0.2, t + dur, 'Default', '', '{\\an8}', sentence());
      t += dur + r() * 2.2;
    }
    // signs
    for (let t = 10; t < secs - 5; t += 20 + r() * 40) {
      const x = 200 + r() * 1500;
      const y = 150 + r() * 700;
      const dur = 2 + r() * 6;
      D(1, t, t + dur, 'Sign', '', `{\\an5\\pos(${n(x)},${n(y)})\\fad(150,150)\\clip(${n(x - 200)},${n(y - 80)},${n(x + 200)},${n(y + 80)})\\bord2\\blur0.6\\1c&H${Math.floor(r() * 0xffffff).toString(16).toUpperCase().padStart(6, '0')}&}`, pick(['STATION', 'RAMEN', 'OPEN', 'EXIT', 'Tokyo Tower']));
    }
    // karaoke
    for (let t = 20; t < 20 + kara - 5; t += 4) {
      const syl = 6 + Math.floor(r() * 6);
      let text = '';
      let at = 0;
      const durs: number[] = [];
      for (let i = 0; i < syl; i++) {
        const k = 12 + Math.floor(r() * 30);
        durs.push(k);
        text += `{\\kf${k}}${pick(['ka', 'shi', 'no', 'mi', 'ra', 'yu', 'ki', 'se', 'ta', 'ro'])}`;
        at += k;
      }
      D(0, t, t + at / 100 + 0.8, 'OP-Kara', '', '', text);
      let off = 0;
      for (let i = 0; i < syl; i++) {
        const x = 300 + (i * 1320) / syl;
        const st = t + off / 100;
        off += durs[i];
        for (let f = 0; f < 3; f++) {
          D(2, st - 0.1, st + 0.9, 'OP-Kara', '', `{\\an5\\move(${n(x)},900,${n(x + (r() - 0.5) * 80)},${n(820 - f * 25)},0,600)\\fad(100,300)\\t(0,300,\\fscx130\\fscy130\\1c&HFFFF00&)\\t(300,900,\\alpha&HFF&)\\bord0\\blur1}`, '★');
        }
      }
    }
    lines.sort((a, c) => (cs2(a) < cs2(c) ? -1 : cs2(a) > cs2(c) ? 1 : 0));
    for (const l of lines) {
      const o = out(l);
      if (o) yield o;
    }
    if (b.pending) yield b.take();
  },
};

const cs2 = (l: string): string => l.slice(l.indexOf(',', 12) + 1, l.indexOf(',', 12) + 12);
