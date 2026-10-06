import { ev, preset } from './ass';

/** End == next start on the same spot, a start between two frames, a zero-length line. Step frame by frame in the Lab to verify. */
const at = (y: number, label: string): string => `{\\an5\\pos(640,${y})\\fs44}${label}`;

export const boundary = preset('boundary', 'Time boundaries', [
  ev(0, 1, at(220, 'A   0.00 - 1.00')),
  ev(1, 2, at(220, 'B   1.00 - 2.00')),
  ev(2.02, 3, at(220, 'C   2.02 - 3.00')),
  ev(3, 3, at(220, 'Z   3.00 - 3.00 (never shown)')),
  ev(3, 4, at(220, 'D   3.00 - 4.00')),
  ev(4, 5, at(220, 'E   4.00 - 5.00')),
  ev(0.5, 1.5, at(460, 'F   0.50 - 1.50')),
  ev(1.5, 2.5, at(460, 'G   1.50 - 2.50')),
  ev(2.5, 3.5, at(460, 'H   2.50 - 3.50')),
  ev(3.5, 5, at(460, 'I   3.50 - 5.00')),
]);
