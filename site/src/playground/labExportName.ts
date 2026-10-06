import { parFileName } from '../../../src/format';

/** "Episode 01.ass" -> "Episode 01" (only the last extension goes). */
export const baseName = (name: string): string => name.replace(/\.[^.]*$/, '');

/** Download name of an export: `<name>.xpar` (lossless) or `<name>.<fps>fps.par` (lossy). One rule for the Lab and the Studio. */
export const exportName = (kind: 'xpar' | 'par', name: string, fps: number): string =>
  kind === 'xpar' ? `${baseName(name)}.xpar` : parFileName(baseName(name), fps);
