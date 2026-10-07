import type { SubtitleSource } from '../source/types';

import { Analyzer } from './Analyzer';
import { Runs } from './runs';
import { dialogues, readHead, windows } from './stream';
import type { AnalyzeOptions, AnalyzeReport } from './types';

export { summaryText } from './text';
export type { AnalyzeOptions, AnalyzeReport, Burst, ChainSummary, KeyUse, SecondRow } from './types';

const yieldNow = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const STEP = 1500;

const cancelled = (): Error => Object.assign(new Error('analysis cancelled'), { name: 'AbortError' });

/**
 * Analyzes an ASS script given as text: when lines appear, how many are visible at once (burst map), which sprites the canvas path
 * would need and when each is first drawn, why events do or do not qualify for it, runs of frame-by-frame events, unused styles.
 * Reads the text line by line and keeps only series and one record per distinct sprite key, so 30-100 MB scripts are fine;
 * yields to the event loop every few thousand events (progress, cancel).
 */
export const analyzeAss = async (text: string, opt: AnalyzeOptions = {}): Promise<AnalyzeReport> => {
  const head = readHead(text);
  const an = new Analyzer(head.script.info, head.script.styles, opt);
  const runs = opt.chains === false ? null : new Runs();
  let n = 0;
  for (const { ev, line } of dialogues(text, head.fields)) {
    an.add(ev);
    runs?.add(line);
    if (++n % STEP === 0) {
      if (opt.signal?.aborted) throw cancelled();
      opt.onProgress?.(Math.min(0.99, n / Math.max(n, text.length / 250)));
      await yieldNow();
    }
  }
  opt.onProgress?.(1);
  return an.report(text.length, runs ? runs.summary(head.script.styles) : null);
};

/** Same for any `SubtitleSource` (read in windows of `windowSeconds`; runs of frame-by-frame events need the text, so `chains` is null). */
export const analyzeSource = async (source: SubtitleSource, opt: AnalyzeOptions = {}): Promise<AnalyzeReport> => {
  const an = new Analyzer(source.script.info, source.script.styles, opt);
  let n = 0;
  for await (const ev of windows(source, opt.windowSeconds ?? 20, opt.signal)) {
    an.add(ev);
    if (++n % STEP === 0) { opt.onProgress?.(Math.min(0.99, n / Math.max(1, source.eventCount))); await yieldNow(); }
  }
  if (opt.signal?.aborted) throw cancelled();
  opt.onProgress?.(1);
  return an.report(null, null);
};
