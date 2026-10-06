const UNITS = ['B', 'kB', 'MB', 'GB'];

/** 1536 -> "1.5 kB". Binary steps (1024), at most one decimal. */
export const humanBytes = (n: number): string => {
  let v = n;
  let u = 0;
  while (v >= 1024 && u < UNITS.length - 1) { v /= 1024; u++; }
  return `${u === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)} ${UNITS[u]}`;
};

/** "1 234 567" for the exact figure next to the human one. */
export const exactBytes = (n: number): string => `${n.toLocaleString('en-US').replace(/,/g, ' ')} B`;

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

/** Seconds -> `h:mm:ss.cc` (hours omitted under one hour). */
export const clock = (s: number): string => {
  const cs = Math.max(0, Math.round((Number.isFinite(s) ? s : 0) * 100));
  const h = Math.floor(cs / 360000);
  const body = `${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
  return h ? `${h}:${body}` : body;
};

export const percent = (part: number, whole: number): string => (whole > 0 ? `${(Math.round((part / whole) * 1000) / 10).toString()}` : '0');
