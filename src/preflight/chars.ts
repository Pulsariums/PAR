import { scanScript } from './preflight';
import type { LineSource, PreflightOptions } from './types';

/**
 * Every code point a script actually draws, ascending, across all of its fonts: override blocks, `\N` `\n` `\h`,
 * whitespace and drawing commands are not characters. Streams like `preflightScript` (no events are kept).
 */
export const usedCharacters = async (source: LineSource, options: Pick<PreflightOptions, 'signal' | 'onProgress'> = {}): Promise<number[]> => {
  const sc = await scanScript(source, { ...options, glyphs: true });
  const all = new Set<number>();
  for (const u of sc.uses.values()) u.chars.forEach((c) => all.add(c));
  return [...all].sort((a, b) => a - b);
};
