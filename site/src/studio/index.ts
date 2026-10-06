import { applyI18n, onLang, t } from '../i18n/i18n';
import { initDropAll } from '../playground/dnd';
import { $ } from '../playground/dom';
import { initMissingPrompt } from '../playground/missingUi';
import { Player } from '../playground/player';

import { initAdvanced } from './advanced';
import { initExamples } from './examples';
import { initExportPanel } from './exportPanel';
import { VideoFpsState } from './fpsState';
import { initFontShelf } from './fontShelf';
import { initLayoutPanel } from './layoutPanel';
import { STUDIO_HTML } from './markup';
import { studioMode } from './mode';
import type { StudioSession } from './session';
import { initShelfTabs } from './shelfTabs';
import { SizeClient } from './size/client';
import { initStats } from './stats';
import { initSubShelf } from './subShelf';
import { initTransport } from './transport';
import { initVideoShelf } from './videoShelf';

const SUB_FILE = /\.(ass|ssa|txt|xpar|par)$/i;

/**
 * The Studio: the one player of the site. A real player (video or test card + PAR overlay + transport) with a media shelf (videos, subtitles, fonts),
 * the size / export panel, and collapsible metrics and virtual-vs-real layout panels. Windowed sources, canvas particle path (`renderMode: 'auto'`).
 */
export const initStudio = (root: HTMLElement): void => {
  root.innerHTML = STUDIO_HTML;
  applyI18n(root);
  const status = (msg: string): void => { $('stStatus').textContent = msg; };
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
  initMissingPrompt(player, fonts.pick, $('stFontPrompt'));
  const selectTab = initShelfTabs(root);
  initDropAll(root, (c) => {
    if (c.fonts.length) { selectTab('Fonts'); void fonts.add(c.fonts); }
    if (c.subs.length) { selectTab('Subs'); void subs.add(c.subs); }
    if (c.videos.length) { selectTab('Videos'); videos.addFiles(c.videos); }
  }, SUB_FILE);

  const relabel = (): void => {
    [videos, subs, fonts].forEach((s) => s.render());
    examples.render(); exporter.rebuild(); transport.label(); layout.relabel(); advanced.sync(); mode(); stats.draw();
  };
  onLang(relabel);
  relabel();
  const loop = (): void => {
    player.tick();
    transport.update();
    const m = player.par.getMetrics();
    stats.sample(m);
    layout.draw(m);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};
