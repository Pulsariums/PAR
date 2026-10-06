import { ev, preset, script } from './ass';

/** Stress test and the "not supported" probe. */

const COLORS = ['&HFFFFFF&', '&H00E5FF&', '&H60FF60&', '&HFF8030&', '&HC050E0&'];

/** 90 simultaneous animated lines (move + rotation + colour + blur) to test frame rate. */
const stressEvents = (): string[] => {
  const out: string[] = [];
  for (let i = 0; i < 90; i++) {
    const y = 40 + ((i * 53) % 640);
    const x1 = (i * 97) % 1280;
    const x2 = 1280 - ((i * 61) % 1280);
    const c = COLORS[i % COLORS.length];
    out.push(
      ev(0, 12, `{\\an5\\move(${x1},${y},${x2},${y},0,10000)\\1c${c}\\bord2\\blur1\\t(0,10000,\\frz${i % 2 ? 360 : -360})}stress ${i + 1}`),
    );
  }
  return out;
};

export const stress = { id: 'stress', title: 'Stress: 90 lines', ass: script(stressEvents(), 0, 'Stress') };

export const unsupported = preset('unsupported', 'Not supported (probe)', [
  ev(0, 8, '{\\an5\\pos(640,120)\\fe238}\\fe is parsed and ignored (web fonts)'),
  ev(0, 8, 'Effect: Banner;40 is not implemented, so this line stays put', { effect: 'Banner;40', style: 'Top' }),
  ev(0, 8, 'Effect: Scroll up is not implemented either', { effect: 'Scroll up;100;600;40', mv: 150 }),
  ev(0, 8, '{\\an5\\pos(640,360)\\kf100}kf on a drawing: {\\p1\\kf100}m 0 0 l 60 0 60 60 0 60{\\p0} switches colour only at the end'),
]);

