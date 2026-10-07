import type { FontLibrary } from '../../../src/fontlib';

let opened: Promise<FontLibrary> | null = null;

/** The user's one font library (IndexedDB), opened once and shared by the playground and the Lab. Loads the fontlib chunk on first use. */
export const getLibrary = (): Promise<FontLibrary> => (opened ??= import('../../../src/fontlib').then((m) => m.FontLibrary.open()));
