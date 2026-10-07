import { writtenPlayRes, LAYOUT_1080P } from '../../../src/index';
import { exactBytes, humanBytes } from '../common/format';
import { t } from '../i18n/i18n';
import { el } from '../player/dom';

import type { StudioSession } from './session';

const kindKey = { ass: 'st.k.ass', xpar: 'st.k.xpar', par: 'st.k.par' } as const;

const kv = (k: string, v: string | Node): HTMLElement => {
  const d = el('div');
  const dd = el('dd');
  dd.append(v);
  d.append(el('dt', '', k), dd);
  return d;
};

/** PlayRes as written in the script, or a note naming the default that applies. */
export const playResText = (s: StudioSession, def: { width: number; height: number }): string => {
  const w = writtenPlayRes(s.source.script.info);
  return w.x > 0 || w.y > 0 ? `${w.x || '?'} x ${w.y || '?'}` : t('st.s.noPlayres', { w: def.width || LAYOUT_1080P.width, h: def.height || LAYOUT_1080P.height });
};

/** What the selected subtitle is: kind, the ASS size next to its container size, events, duration, styles, PlayRes, fonts. `playRes` is filled by the caller (it follows the layout panel). */
export const sessionInfo = (s: StudioSession, playRes: HTMLElement): HTMLElement => {
  const dl = el('dl', 'st-kv');
  const fonts = [...new Set([...s.source.script.styles.values()].map((x) => x.fontName))];
  const orig = s.header?.sourceBytes;
  dl.append(
    kv(t('st.file'), `${s.name} (${t(kindKey[s.kind])})`),
    kv(s.kind === 'ass' ? t('st.s.orig') : t(kindKey[s.kind]), `${humanBytes(s.blob.size)} (${exactBytes(s.blob.size)})`),
    ...(s.kind === 'ass' ? [] : [kv(t('st.s.orig'), orig ? `${humanBytes(orig)} (${exactBytes(orig)})` : t('st.s.none'))]),
    kv(t('st.s.events'), s.source.eventCount.toLocaleString('en-US')),
    kv(t('st.s.dur'), `${s.source.duration.toFixed(2)} s`),
    kv(t('st.s.styles'), String(s.source.script.styles.size)),
    kv(t('st.s.playres'), playRes),
    kv(t('st.s.fonts'), fonts.join(', ') || t('st.s.none')),
  );
  return dl;
};

/** The note of a container file (made from which ASS, baked for which fps) and its notice, if any. */
export const containerNotes = (s: StudioSession): HTMLElement[] => {
  const h = s.header;
  const fps = h?.fps ? t('st.s.containerFps', { fps: h.fps }) : '';
  const notes = [el('p', 'hint', t('st.s.container', { kind: t(kindKey[s.kind]), size: humanBytes(s.blob.size), src: h?.sourceBytes ? humanBytes(h.sourceBytes) : '?', fps }))];
  if (h?.notice) notes.push(el('p', 'hint err', h.notice));
  return notes;
};
