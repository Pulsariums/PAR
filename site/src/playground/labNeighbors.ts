import { msOf, type SubtitleSource } from '../../../src/index';

/** Start of the first line after `t` (seconds), looking at windows that grow 4x each step. Null when there is none. */
export const nextStart = async (src: SubtitleSource, t: number): Promise<number | null> => {
  const tMs = msOf(t);
  for (let from = t, span = 2; from < src.duration; from += span, span *= 4) {
    const starts = (await src.readWindow(from, from + span)).map((e) => e.start).filter((s) => msOf(s) > tMs);
    if (starts.length) return Math.min(...starts);
  }
  return null;
};

/** Start of the last line that began before `t`, looking back in windows that grow 4x each step. Null when there is none. */
export const prevStart = async (src: SubtitleSource, t: number): Promise<number | null> => {
  const tMs = msOf(t);
  for (let to = t, span = 2; to > 0; to -= span, span *= 4) {
    const from = Math.max(0, to - span);
    const starts = (await src.readWindow(from, to)).map((e) => e.start).filter((s) => msOf(s) < tMs && msOf(s) >= msOf(from));
    if (starts.length) return Math.max(...starts);
  }
  return null;
};
