/**
 * `pulsar-ass-renderer/fontlib`: the user's own persistent font store (IndexedDB), usable as a `FontProvider`.
 * Separate entry: the renderer core never imports it.
 */
export { FontLibrary } from './FontLibrary';
export { SCRIPTS, scriptBadges, scriptRatios } from './badges';
export type { ScriptDef } from './badges';
export { blockName, blockStats, codeLabel } from './blocks';
export type { BlockStat } from './blocks';
export { zipStore } from './zipWrite';
export { hasCp, countAll, nthCp, readCmap, sliceCps } from '../fonts/coverage';
export { RECORD_VERSION, FontLibraryError } from './types';
export type { AddResult, FontRecord, LibraryOptions, LibraryUsage, RepairResult, StorageManagerLike } from './types';
export { SCHEMA_VERSION } from './idb';
export { WARN_RATIO } from './storage';
