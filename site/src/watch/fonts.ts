import type { FontLibrary } from '../../../src/fontlib';
import { getLibrary } from '../player/libShared';

import type { WatchStage } from './stage';

/** The user's persistent font library (IndexedDB, the same one the Lab uses): fonts added once are there on the next visit. */
export const initFonts = (stage: WatchStage, onCount: (n: number) => void) => {
  let lib: FontLibrary | null = null;
  const ready = getLibrary().then((l) => {
    lib = l;
    stage.par.setOptions({ fontProviders: [l.asProvider()] });
    const count = (): void => void l.list().then((r) => onCount(r.length));
    l.onChange(count);
    count();
    return l;
  });
  return {
    /** Adds font files or zips of fonts; resolves with how many were added and the errors. */
    async add(files: File[]): Promise<{ added: number; errors: string[] }> {
      await ready;
      const res = await lib!.add(files);
      void lib!.requestPersistence();
      return { added: res.added.length, errors: res.errors.map((e) => `${e.name}: ${e.error}`) };
    },
    ready,
  };
};
