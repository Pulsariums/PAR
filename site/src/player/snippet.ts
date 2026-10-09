import { t } from '../i18n/i18n';

/** What the generated `create(...)` call needs to know about the Studio's current choices. */
export interface SnippetInput {
  hasVideo: boolean;
  /** `'auto'` or a render fps. */
  fps: 'auto' | number;
  videoFps: number | null;
  timeOffset: number;
  renderMode: 'auto' | 'dom' | 'canvas';
  warmRangeSeconds?: number;
  seekBuffer?: boolean;
}

/** The `create(...)` call equivalent to the current choices (defaults omitted). */
export const buildSnippet = (s: SnippetInput): string => {
  const src = s.hasVideo
    ? ["  video: document.querySelector('video'),"]
    : ['  container: document.querySelector(\'.player\'),', '  clock: () => myPlayer.currentTime, // seconds'];
  const lines = [...src, '  subtitle: assText,'];
  if (s.fps !== 'auto') lines.push(`  fps: ${s.fps},`);
  if (s.videoFps !== null && s.videoFps > 0) lines.push(`  videoFps: ${s.videoFps},`);
  if (s.timeOffset !== 0) lines.push(`  timeOffset: ${s.timeOffset},`);
  if (s.renderMode !== 'auto') lines.push(`  renderMode: '${s.renderMode}',`);
  if (s.warmRangeSeconds !== undefined && s.warmRangeSeconds !== 30) lines.push(`  warmRangeSeconds: ${s.warmRangeSeconds},`);
  if (s.seekBuffer === false) lines.push('  seekBuffer: false,');
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

/** A button that copies `get()` and says so for a moment. */
export const copyButton = (btn: HTMLButtonElement, get: () => string, label = 'code.copy', done = 'code.copied'): void => {
  btn.addEventListener('click', async () => {
    if (await copyText(get())) {
      btn.textContent = t(done as 'code.copied');
      window.setTimeout(() => { btn.textContent = t(label as 'code.copy'); }, 1500);
    }
  });
};
