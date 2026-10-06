/**
 * PAR - Pulsar ASS Renderer. A dependency-free ASS/SSA subtitle renderer for the browser.
 *
 * ```ts
 * import { create } from 'pulsar-ass-renderer';
 * const par = create({ video, subtitle: assText });
 * ```
 */
import { PARRenderer } from './core/Renderer';
import type { PAROptions } from './types/options';

export const VERSION = '0.1.0';

/** Creates a renderer and mounts its overlay. See `PAROptions`. */
export const create = (options: PAROptions): PARRenderer => new PARRenderer(options);

export { PARRenderer };
export { parseScript } from './parser/ScriptParser';
export { parseText } from './parser/TextParser';
export { parseBlock, parseTransition } from './parser/TagParser';
export { lexOverrides } from './parser/TagLexer';
export { parseDrawing } from './parser/DrawingParser';
export { resolvePlayRes } from './parser/ScriptInfo';
export { fitRect, resolveRegion } from './layout/Region';
export type { ObjectFit, RegionInput } from './layout/Region';
export { resolveLayoutSize, stageTransform } from './layout/Layout';
export type { Size, StageTransform } from './layout/Layout';
export { extractEmbeddedFiles, uudecode } from './fonts/uudecode';
export type { EmbeddedFile } from './fonts/uudecode';
export { parseFont } from './fonts/loader';
export type { ParsedFace } from './fonts/loader';
export { DEFAULT_RATIO, sizeRatio } from './fonts/ratio';
export type * from './fonts/types';
export type * from './types/options';
export type * from './types/script';
export { SOFT_BREAK } from './types/script';
