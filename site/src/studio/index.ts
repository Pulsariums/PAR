import { applyI18n, onLang, t } from '../i18n/i18n';
import { initDropAll } from '../player/dnd';
import { $ } from '../player/dom';
import { initMissingPrompt } from '../player/missingUi';
import { Player } from '../player/player';

import { initAdvanced } from './advanced';
import { initExamples } from './examples';
import { initExportPanel } from './exportPanel';
import { VideoFpsState } from './fpsState';
import { initFontShelf } from './fontShelf';
import { initLayoutPanel } from './layoutPanel';
import { initEditor } from './editor';
import { initAnalyze } from './analyze/ui';
import { initOptimize } from './optimize/ui';
import { initPerf } from './perf/ui';
import { initFontLib } from './fontLib';
import { initFontsReport } from './fontsReport';
import { initReference } from './reference';
import { STUDIO_HTML } from './markup';
import { studioMode } from './mode';
import type { StudioSession } from './session';
import { initShelfTabs } from './shelfTabs';
import { SizeClient } from './size/client';
import { initStats } from './stats';
import { initSubShelf } from './subShelf';
import { initTransport } from './transport';
import { initVideoShelf } from './videoShelf';
import { loadView, onViewRequest, saveView, type View } from '../view';
import { presetById } from '../presets';

const SUB_FILE = /\.(ass|ssa|txt|xpar|par)$/i;

/**
 * The Studio: the one engine of the site, in two views. Watch is the player alone (video or test card + PAR overlay + transport + the media shelf):
 * nothing is measured or drawn besides the player, so what you see is what PAR costs on your machine. Lab adds the size / export panel, advanced
 * options, metrics, the virtual-vs-real layout panel and the reference (feature matrix, generated code). Windowed sources, canvas particle path.
 */
export const initStudio = (root: HTMLElement): void => {
  root.innerHTML = STUDIO_HTML;
  applyI18n(root);
  const status = (msg: string): void => { $('stStatus').textContent = msg; };
  let view: View = loadView();
  const player = new Player($('stStage'), $<HTMLCanvasElement>('stCard'), $<HTMLVideoElement>('stVid'), '');
  const fps = new VideoFpsState();
  let session: StudioSession | null = null;
  let client: SizeClient | null = null;
  const sizes = (): SizeClient => (client ??= new SizeClient());

  const layout = initLayoutPanel(player.par, () => exporter.playRes());
  const exporter = initExportPanel($('stExport'), sizes, layout.defaultSize);
  const stats = initStats(player, () => fps.steps);
  const transport = initTransport(player, () => fps.steps, (to) => stats.seeked(to), () => session?.source ?? null);
  const advanced = initAdvanced(player.par, fps, () => exporter.setVideoFps(fps.option));
  const mode = (): void => { $('stMode').textContent = t(`st.mode.${studioMode(player.hasVideo, session !== null)}`); };

  const fonts = initFontShelf($('stShelfFonts'), player, status);
  const subs = initSubShelf($('stShelfSubs'), player, {
    status,
    session: (s) => {
      session = s;
      if (!s) stats.opened();
      exporter.setSession(s);
      fonts.setUsed(s ? [...s.source.script.styles.values()].map((x) => x.fontName) : []);
      mode();
    },
  });
  const videos = initVideoShelf($('stShelfVideos'), player, (detected) => {
    fps.detected = detected;
    player.par.setOptions({ videoFps: fps.option });
    advanced.sync();
    exporter.setVideoFps(fps.option);
    mode();
  });
  const examples = initExamples(sizes, (files, select) => subs.add(files, select), status);
  initEditor(subs, status);
  initOptimize({ session: () => session, add: (f, s) => subs.add(f, s), videoFps: () => fps.detected ?? fps.picked, status });
  initAnalyze({ session: () => session, videoFps: () => fps.detected ?? fps.picked });
  initPerf({ player, session: () => session, choices: () => { const a = advanced.values(); return { renderMode: a.renderMode, fps: a.fps, videoFps: a.videoFps }; } });
  // The fonts report and the library manager load when their fold is first opened: the watch view never pays for them.
  const fontsFold = $('stFonts');
  let fontsReport: ReturnType<typeof initFontsReport> | null = null;
  fontsFold.addEventListener('toggle', () => {
    if (!(fontsFold as HTMLDetailsElement).open || fontsReport) return;
    fontsReport = initFontsReport(player);
    initFontLib($('fontLib'), player);
    fontsReport.draw();
  });
  const reference = initReference(
    () => ({ hasVideo: player.hasVideo, ...advanced.values() }),
    (id) => { const p = presetById(id); if (p) void subs.add([new File([p.ass], `${p.id}.ass`)], true); $('stStage').scrollIntoView({ block: 'nearest' }); },
  );
  root.addEventListener('change', () => reference.refresh());
  initMissingPrompt(player, fonts.pick, $('stFontPrompt'));
  const selectTab = initShelfTabs(root);
  initDropAll(root, (c) => {
    if (c.fonts.length) { selectTab('Fonts'); void fonts.add(c.fonts); }
    if (c.subs.length) { selectTab('Subs'); void subs.add(c.subs); }
    if (c.videos.length) { selectTab('Videos'); videos.addFiles(c.videos); }
  }, SUB_FILE);

  const setView = (v: View, remember = true): void => {
    view = v;
    root.querySelector<HTMLElement>('#st')!.dataset.view = v;
    root.querySelectorAll<HTMLButtonElement>('#stView [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    if (remember) saveView(v);
    if (v === 'lab') { reference.refresh(); stats.draw(); }
  };
  root.querySelector('#stView')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-view]');
    if (b) setView(b.dataset.view as View);
  });
  onViewRequest((v) => setView(v));
  setView(view, false);

  const relabel = (): void => {
    [videos, subs, fonts].forEach((s) => s.render());
    examples.render(); exporter.rebuild(); transport.label(); layout.relabel(); advanced.sync(); mode(); stats.draw(); reference.refresh();
  };
  onLang(() => { relabel(); fontsReport?.draw(); });
  relabel();
  const loop = (): void => {
    player.tick();
    transport.update();
    // The watch view measures nothing: no metrics, no layout panel, so the only work is PAR's own.
    if (view === 'lab') {
      const m = player.par.getMetrics();
      stats.sample(m);
      layout.draw(m);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};
