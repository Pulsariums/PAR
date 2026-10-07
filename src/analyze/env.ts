import { staticFontEnv } from '../fonts/env';
import { createProbe } from '../fonts/probe';
import { stageTransform } from '../layout/Layout';
import type { LineEnv } from '../render/LineView';
import type { AssStyle, ScriptInfo } from '../types/script';

/** No fonts are loaded in an analysis and no canvas is probed: names resolve as the pool-less path does (CSS family, default size factor). */
const fonts = staticFontEnv({}, createProbe(() => null));

/**
 * The environment the canvas path would draw this script in: layout size from the script, `width` device pixels wide (default: the
 * layout width, one device pixel per unit), borders and blur scaled as `stageTransform` does.
 */
export const analysisEnv = (info: ScriptInfo, styles: Map<string, AssStyle>, width: number | undefined, fps: number): { env: LineEnv; scale: number; layout: [number, number] } => {
  const lw = info.layoutResX || info.playResX || 1280;
  const lh = info.layoutResY || info.playResY || 720;
  const layout = { width: info.playResX || lw, height: info.playResY || lh };
  const scale = width && width > 0 ? Math.round((width / layout.width) * 1000) / 1000 : 1;
  const st = stageTransform({ x: 0, y: 0, width: layout.width * scale, height: layout.height * scale }, layout, info.scaledBorderAndShadow, info.layoutResX && info.layoutResY ? { width: info.layoutResX, height: info.layoutResY } : null);
  return { env: { layout, styles, borderScale: st.borderScale, blurScale: st.blurScale, devScale: scale, frameMs: 1000 / fps, fonts }, scale, layout: [layout.width, layout.height] };
};
