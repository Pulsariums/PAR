export type Status = 'rendered' | 'approx' | 'unsupported';

export interface Feature {
  label: string;
  status: Status;
  preset: string;
}

/** Keep in sync with the "Supported tags" tables in README.md / README.tr.md / README.ru.md. */
export const FEATURES: readonly Feature[] = [
  { label: '\\pos', status: 'rendered', preset: 'pos' },
  { label: '\\move', status: 'rendered', preset: 'move' },
  { label: '\\an \\a', status: 'rendered', preset: 'an' },
  { label: '\\org \\frx \\fry \\frz', status: 'rendered', preset: 'rot' },
  { label: '\\fad \\fade', status: 'rendered', preset: 'fad' },
  { label: '\\t (accel, nested tags)', status: 'rendered', preset: 't' },
  { label: '\\clip rect', status: 'rendered', preset: 'clip' },
  { label: '\\iclip rect', status: 'rendered', preset: 'iclip' },
  { label: '\\clip vector', status: 'rendered', preset: 'vclip' },
  { label: '\\k \\K \\kf \\ko \\kt', status: 'rendered', preset: 'karaoke' },
  { label: '\\r \\r<style>', status: 'rendered', preset: 'reset' },
  { label: '\\fs \\fscx \\fscy', status: 'rendered', preset: 'scale' },
  { label: '\\fsp', status: 'rendered', preset: 'fsp' },
  { label: '\\fax \\fay', status: 'rendered', preset: 'shear' },
  { label: '\\b \\i \\u \\s \\fn', status: 'rendered', preset: 'basic' },
  { label: '\\bord \\shad', status: 'rendered', preset: 'bord' },
  { label: '\\c \\1c..\\4c \\alpha \\1a..\\4a', status: 'rendered', preset: 'color' },
  { label: '\\blur \\be', status: 'approx', preset: 'blur' },
  { label: '\\p drawings, \\pbo', status: 'rendered', preset: 'drawing' },
  { label: '\\q1 \\q2', status: 'rendered', preset: 'wrap' },
  { label: '\\q0 \\q3, WrapStyle 0/3', status: 'approx', preset: 'wrap' },
  { label: 'BorderStyle 3', status: 'rendered', preset: 'box' },
  { label: 'Layers', status: 'rendered', preset: 'layers' },
  { label: 'Collision stacking', status: 'rendered', preset: 'collision' },
  { label: 'Comments', status: 'rendered', preset: 'comments' },
  { label: '[Fonts] embedded fonts', status: 'rendered', preset: 'fontsEmbedded' },
  { label: 'addFont / addFonts, fontMap', status: 'rendered', preset: 'fontsUser' },
  { label: '\\fe', status: 'unsupported', preset: 'unsupported' },
  { label: 'Effect: Banner / Scroll', status: 'unsupported', preset: 'unsupported' },
  { label: '\\kf on drawings', status: 'unsupported', preset: 'unsupported' },
];
