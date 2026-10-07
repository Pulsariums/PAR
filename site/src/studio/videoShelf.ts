import { t } from '../i18n/i18n';
import { humanBytes } from '../common/format';
import type { Player } from '../player/player';

import { probeFps } from './fpsDetect';
import { regionFor } from './mode';
import { Shelf, newId } from './shelfState';
import { createShelf } from './shelfView';

export interface VideoItem { id: string; name: string; size: number; url: string; error: string }

/** Videos shelf: local files through object URLs. Selecting swaps only the picture: the subtitle stays, position and play state carry over. */
export const initVideoShelf = (host: HTMLElement, player: Player, onFps: (fps: number | null) => void) => {
  const shelf = new Shelf<VideoItem>();
  let applied: string | null = null;
  const addFiles = (files: File[]): void => shelf.add(files.map((f) => ({ id: newId('v'), name: f.name, size: f.size, url: URL.createObjectURL(f), error: '' })));
  const view = createShelf(host, {
    title: 'st.videos', empty: 'st.emptyV', accept: 'video/*,.mkv,.mp4,.webm,.mov,.m4v,.ogv', selectable: true,
    onFiles: (files) => addFiles(files),
    onSelect: (id) => { shelf.select(id); },
    onRemove: (id) => { const gone = shelf.remove(id); if (gone) URL.revokeObjectURL(gone.url); },
  });
  const draw = (): void => view.render(shelf.items.map((v) => ({ id: v.id, name: v.name, meta: humanBytes(v.size), error: v.error, selected: v.id === shelf.selectedId })));

  const apply = (): void => {
    const cur = shelf.selected;
    if ((cur?.id ?? null) === applied) return;
    applied = cur?.id ?? null;
    if (!cur) { player.useCard(); player.par.setOptions({ region: regionFor(false) }); onFps(null); return; }
    const v = player.video;
    const keep = player.hasVideo ? { t: v.currentTime, play: !v.paused } : { t: 0, play: false };
    player.useVideo(cur.url);
    player.par.setOptions({ region: regionFor(true) });
    onFps(null);
    v.addEventListener('loadedmetadata', () => {
      cur.error = '';
      if (keep.t > 0) v.currentTime = Math.min(keep.t, Math.max(0, v.duration - 0.05));
      if (keep.play) void v.play().catch(() => undefined);
      draw();
    }, { once: true });
    void probeFps(cur.url).then((fps) => { if (applied === cur.id) onFps(fps); });
  };

  player.video.addEventListener('error', () => {
    const cur = shelf.selected;
    if (!cur || !player.hasVideo || !player.video.error) return;
    cur.error = t('st.vErr');
    draw();
  });
  shelf.subscribe(() => { apply(); draw(); });
  return { render: draw, addFiles };
};
