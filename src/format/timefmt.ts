const TIME_RE = /^(0|[1-9]\d{0,3}):([0-5]\d):([0-5]\d)\.(\d\d)$/;

/** Canonical `H:MM:SS.cc` => centiseconds; null for any other spelling (those lines stay verbatim). */
export const parseCs = (s: string): number | null => {
  const m = TIME_RE.exec(s);
  return m ? ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 100 + Number(m[4]) : null;
};

const p2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

export const fmtCs = (cs: number): string => {
  const c = cs % 100;
  const s = Math.floor(cs / 100);
  return `${Math.floor(s / 3600)}:${p2(Math.floor(s / 60) % 60)}:${p2(s % 60)}.${p2(c)}`;
};
