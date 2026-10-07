import { sniffBlob } from '../../../src/source';
import { humanBytes } from '../common/format';
import { t } from '../i18n/i18n';
import { classifyFiles, watchDrop } from '../player/dnd';
import { $ } from '../player/dom';

import type { initFonts } from './fonts';
import type { WatchStage } from './stage';

const SUB = /\.(ass|ssa|txt|xpar|par)$/i;

/** File intake: three pickers (video, subtitle, fonts) plus drop anywhere on the page. Every file is routed by its kind, so one drop of all three works. */
export const initFiles = (stage: WatchStage, fonts: ReturnType<typeof initFonts>, root: HTMLElement) => {
  const status = (msg: string, err = false): void => { const s = $('wStatus'); s.textContent = msg; s.classList.toggle('err', err); };
  const names = { video: '', sub: '', fonts: 0 };
  const draw = (): void => {
    $('wVideoName').textContent = names.video || t('w.none');
    $('wSubName').textContent = names.sub || t('w.none');
    $('wFontsName').textContent = names.fonts ? t('w.fontsN', { n: names.fonts }) : t('w.fontsNone');
    stage.box.classList.toggle('has-video', stage.hasVideo);
    $('wEmpty').hidden = stage.hasVideo;
  };

  const addVideo = (file: File): void => {
    names.video = `${file.name} (${humanBytes(file.size)})`;
    stage.setVideo(file);
    draw();
    status(names.sub && stage.session ? '' : t('w.videoOk'));
  };
  const addSub = async (file: File): Promise<void> => {
    const state = $('wState');
    try {
      const kind = await sniffBlob(file).catch(() => 'unknown' as const);
      if (kind === 'unknown') { status(t('w.subBad', { name: file.name }), true); return; }
      state.hidden = false;
      const s = await stage.setSubtitle(file, (d, n) => { state.textContent = t('w.reading', { pct: Math.round((d / Math.max(1, n)) * 100) }); });
      if (!s) return;
      names.sub = `${file.name} (${humanBytes(file.size)})`;
      draw();
      status(stage.hasVideo ? t('w.subReady', { n: s.source.eventCount.toLocaleString('en-US') }) : t('w.needVideo'));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      status(t('w.fail', { error: e instanceof Error ? e.message : String(e) }), true);
    } finally { state.hidden = true; }
  };
  const addFonts = async (files: File[]): Promise<void> => {
    const r = await fonts.add(files).catch((e: unknown) => ({ added: 0, errors: [String(e)] }));
    status(r.errors.length ? t('w.fontsErr', { n: r.added, e: r.errors.join('; ') }) : t('w.fontsAdded', { n: r.added }), r.errors.length > 0 && r.added === 0);
  };

  const route = (files: File[]): void => {
    const c = classifyFiles(files, SUB);
    if (c.fonts.length) void addFonts(c.fonts);
    if (c.subs.length) void addSub(c.subs[0]!);
    if (c.videos.length) addVideo(c.videos[0]!);
    if (!c.fonts.length && !c.subs.length && !c.videos.length && files.length) status(t('w.unknown', { name: files[0]!.name }), true);
  };
  const bind = (inputId: string, buttons: string[]): void => {
    const input = $<HTMLInputElement>(inputId);
    buttons.forEach((b) => $(b).addEventListener('click', () => input.click()));
    input.addEventListener('change', () => { route([...(input.files ?? [])]); input.value = ''; });
  };
  bind('wFileVideo', ['wPickVideo', 'wPickVideo0']);
  bind('wFileSub', ['wPickSub', 'wPickSub0']);
  bind('wFileFonts', ['wPickFonts', 'wPickFonts0']);
  watchDrop(document.body, route);
  stage.video.addEventListener('error', () => { if (stage.hasVideo && stage.video.error) status(t('w.vErr'), true); });
  void root;

  return { draw, fontCount: (n: number): void => { names.fonts = n; draw(); }, status };
};
