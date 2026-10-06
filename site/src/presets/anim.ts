import { ev, preset } from './ass';

/** Presets about time: \t, karaoke, \r. */

export const t = preset('t', '\\t animations', [
  ev(0, 8, '{\\an5\\pos(640,150)\\t(0,3000,\\fscx200\\fscy200)}t: scale 100 to 200%'),
  ev(0, 8, '{\\an5\\pos(1060,300)\\fs36\\t(0,4000,2,\\frz360)}accel 2'),
  ev(0, 8, '{\\an5\\pos(640,430)\\1c&H0000FF&\\t(0,2000,\\1c&H00FF00&\\bord8)\\t(2000,4000,\\1c&HFF8000&\\fs70)}two stacked \\t, several tags each'),
  ev(0, 8, '{\\an5\\pos(640,560)\\fs30\\t(\\fs72\\blur3)}no times: spans the whole line'),
  ev(0, 8, '{\\an5\\pos(640,660)\\fs40\\t(3000,3000,\\1c&H0000FF&)}step at 3s (t2 <= t1)'),
]);

export const reset = preset('reset', '\\r style reset', [
  ev(0, 8, '{\\fs72\\1c&H0000FF&\\i1}Big red italic{\\r} back to the line style', { mv: 200 }),
  ev(0, 8, 'Default then {\\rTop}switch to Top style{\\r} and back', { mv: 120 }),
  ev(0, 8, '{\\rNoSuchStyle\\fs28}unknown style falls back to the line style', { mv: 50 }),
]);

export const karaoke = preset('karaoke', 'Karaoke \\k \\kf \\ko', [
  ev(0, 8, '{\\k50}ka{\\k50}ra{\\k50}o{\\k50}ke {\\k100}\\k: colour switch', { style: 'Kara', mv: 280 }),
  ev(0, 8, '{\\kf50}ka{\\kf50}ra{\\kf50}o{\\kf50}ke {\\kf100}\\kf: left-to-right sweep', { style: 'Kara', mv: 190 }),
  ev(0, 8, '{\\ko50}ka{\\ko50}ra{\\ko50}o{\\ko50}ke {\\ko100}\\ko: outline reveal', { style: 'Kara', mv: 100 }),
  ev(0, 8, '{\\K40}ca{\\K40}pi{\\K40}tal {\\K40}K {\\K80}sweep', { style: 'Kara', mv: 10 }),
]);
