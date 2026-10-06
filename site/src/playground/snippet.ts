import { t } from '../i18n/i18n';

import type { Settings } from './store';

/** The `create(...)` call equivalent to the current settings (defaults omitted). */
export const buildSnippet = (s: Readonly<Settings>, hasVideo: boolean): string => {
  const src = hasVideo
    ? ["  video: document.querySelector('video'),"]
    : ['  container: document.querySelector(\'.player\'),', '  clock: () => myPlayer.currentTime, // seconds'];
  const lines = [...src, '  subtitle: assText,'];
  if (s.region === 'custom') {
    const r = s.rect;
    lines.push(`  region: { x: ${r.x}, y: ${r.y}, width: ${r.width}, height: ${r.height} },`);
  } else if (s.region !== (hasVideo ? 'video' : 'container')) lines.push(`  region: '${s.region}',`);
  if (s.layoutCustom) lines.push(`  layout: { width: ${s.layout.width}, height: ${s.layout.height} },`);
  if (!s.fpsAuto) lines.push(`  fps: ${s.fps},`);
  if (s.videoFps.trim() !== '' && Number(s.videoFps) > 0) lines.push(`  videoFps: ${Number(s.videoFps)},`);
  if (s.timeOffset !== 0) lines.push(`  timeOffset: ${s.timeOffset},`);
  if (s.zIndex !== 1) lines.push(`  zIndex: ${s.zIndex},`);
  return `import { create } from 'pulsar-ass-renderer';\n\nconst par = create({\n${lines.join('\n')}\n});`;
};

/** Copies text; falls back to a hidden textarea where the async clipboard API is unavailable. */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
};

export const initCopy = (get: () => string) => {
  const btn = document.getElementById('copy') as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    if (await copyText(get())) {
      btn.textContent = t('code.copied');
      window.setTimeout(() => { btn.textContent = t('code.copy'); }, 1500);
    }
  });
};
