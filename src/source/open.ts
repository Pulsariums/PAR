import { sniff, type SniffKind } from '../format/open';
import { fromAssFile, type FileSourceOptions } from './fromFile';
import { fromAssText } from './fromText';
import { fromPar, fromXpar } from './fromXpar';
import type { SubtitleSource } from './types';

export type SourceKind = Exclude<SniffKind, 'unknown'>;

/** What a Blob is, from its first bytes (ass | xpar | par | unknown). */
export const sniffBlob = async (blob: Blob): Promise<SniffKind> => sniff(new Uint8Array(await blob.slice(0, 4096).arrayBuffer())).kind;

/**
 * Opens any supported input on the CURRENT thread: a string (ASS text), or a Blob / File that is an ASS file, an `.xpar` or a
 * `.par` (sniffed from the content, not the name). Use `openSourceInWorker` to keep decoding off the main thread.
 */
export const openSource = async (input: string | Blob, opts: FileSourceOptions & { kind?: SourceKind } = {}): Promise<SubtitleSource> => {
  if (typeof input === 'string') return fromAssText(input);
  const kind = opts.kind ?? (await sniffBlob(input));
  if (kind === 'xpar') return fromXpar(input);
  if (kind === 'par') return fromPar(input);
  if (kind === 'ass') return fromAssFile(input, opts);
  throw new Error('PAR: this file is not an ASS script, an XPAR or a PAR file');
};
