const TIME_RE = /^\s*(?:(\d+):)?(?:(\d+):)?(\d+)(?:[.,](\d+))?\s*$/;

/**
 * `H:MM:SS.cc` => seconds, using integer millisecond arithmetic (no float accumulation):
 * "0:00:01.20" => 1.2 exactly. Fraction digits are truncated to ms. Invalid input => NaN.
 */
export const parseTime = (value: string): number => {
  const m = TIME_RE.exec(value);
  if (!m) return NaN;
  const hasH = m[1] !== undefined && m[2] !== undefined;
  const h = hasH ? Number(m[1]) : 0;
  const min = hasH ? Number(m[2]) : m[1] !== undefined ? Number(m[1]) : 0;
  const s = Number(m[3]);
  const ms = m[4] ? Number(m[4].slice(0, 3).padEnd(3, '0')) : 0;
  return (((h * 60 + min) * 60 + s) * 1000 + ms) / 1000;
};
