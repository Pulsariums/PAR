export type XparErrorCode =
  | 'BAD_MAGIC' | 'BAD_VERSION' | 'TRUNCATED' | 'CORRUPT' | 'CHECKSUM' | 'LIMIT' | 'UNSUPPORTED' | 'IO' | 'INVALID_INPUT' | 'ABORTED';

/** Every failure of the XPAR/PAR readers and writers. `code` is stable, `message` is for humans. */
export class XparError extends Error {
  constructor(readonly code: XparErrorCode, message: string) {
    super(`xpar: ${message}`);
    this.name = 'XparError';
  }
}

export const fail = (code: XparErrorCode, message: string): never => {
  throw new XparError(code, message);
};

/** Hard caps that bound memory for hostile files (decompression bombs, absurd counts). */
export const LIMITS = {
  maxChunkRaw: 64 * 1024 * 1024,
  maxMetaRaw: 256 * 1024 * 1024,
  maxIndexEntries: 4_000_000,
  maxStreams: 4096,
  maxEvents: 4_000_000,
  maxStringLen: 64 * 1024 * 1024,
  maxLineBytes: 128 * 1024 * 1024,
  maxFonts: 4096,
  maxVecLen: 1_000_000,
} as const;
