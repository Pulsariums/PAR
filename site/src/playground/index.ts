import { applyI18n, onLang } from '../i18n/i18n';

import { initDrop } from './dnd';
import { initMatrix } from './matrix';
import { initMetrics } from './metrics';
import { initOptions } from './options';
import { Player } from './player';
import { buildSnippet, initCopy } from './snippet';
import { initSource } from './source';
import { Store } from './store';
import { initSubs } from './subs';
import { initTabs } from './tabs';
import { initTransportUi } from './transportUi';
import { PLAYGROUND_HTML } from './markup';
import { presetById } from '../presets';

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Builds the playground inside `root` and starts its animation loop. */
export const initPlayground = (root: HTMLElement): void => {
  root.innerHTML = PLAYGROUND_HTML;
  applyI18n(root);
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const store = new Store();
  const player = new Player($('stage'), $<HTMLCanvasElement>('card'), $<HTMLVideoElement>('vid'), presetById('basic')!.ass);
  const selectTab = initTabs($('pg'));
  const snippet = $<HTMLElement>('snippet');
  const options = initOptions(store, () => player.hasVideo);
  const metrics = initMetrics(player);
  const transport = initTransportUi(player);

  const refresh = () => {
    options.error(player.apply(store.get()));
    snippet.textContent = buildSnippet(store.get(), player.hasVideo);
    options.sync();
    metrics.draw();
  };
  store.subscribe(refresh);
  const source = initSource(player, store, refresh);
  const subs = initSubs(player, refresh);
  initMatrix((id) => { subs.setPreset(id); selectTab('subs'); $('stage').scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); });
  initCopy(() => snippet.textContent ?? '');
  initDrop(root, (f) => source.loadFile(f), (f) => void subs.loadFile(f));
  onLang(() => { transport.label(); metrics.draw(); });

  subs.setPreset('basic');
  if (!reduced()) player.card.play();
  refresh();

  const loop = () => {
    player.tick();
    transport.update();
    metrics.sample();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};
