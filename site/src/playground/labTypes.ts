import type { ParHeader } from '../../../src/format';
import type { SubtitleSource } from '../../../src/index';

/** A file the Lab has opened. */
export interface LabSession {
  name: string;
  blob: Blob;
  kind: 'ass' | 'xpar' | 'par';
  source: SubtitleSource;
  /** Time from "open" to a ready source (index + header), ms. */
  openMs: number;
  /** XPAR / PAR provenance and settings (container files only). */
  header: ParHeader | null;
}
