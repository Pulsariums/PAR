import { writtenPlayRes, LAYOUT_720P } from '../../../src/index';
import { t } from '../i18n/i18n';

import { el } from './dom';
import { PAR_MARKS, fpsChips, type Chips } from './fpsMarks';
import { exactBytes, humanBytes } from './labFormat';
import { SizeJobs } from './labSizeJobs';
import type { SizeClient } from './labSizeClient';
import type { LabSession } from './labTypes';

const kv = (k: string, v: string | Node): HTMLElement => {
  const d = el('div');
  const dt = el('dt', '', k);
  const dd = el('dd');
  dd.append(v);
  d.append(dt, dd);
  return d;
};

const kindKey = { ass: 'lab.k.ass', xpar: 'lab.k.xpar', par: 'lab.k.par' } as const;

/** Size panel: what the file is, and what XPAR (lossless) and PAR (lossy, at a chosen fps) make of it. */
export const initLabSize = (panel: HTMLElement, client: SizeClient, getDefault: () => { width: number; height: number }) => {
  let session: LabSession | null = null;
  let jobs: SizeJobs | null = null;
  let chips: Chips | null = null;
  let fps = 24;
  const play = el('span');
  const playRes = (): void => {
    if (!session) return;
    const w = writtenPlayRes(session.source.script.info);
    const def = getDefault();
    play.textContent = w.x > 0 || w.y > 0 ? `${w.x || '?'} x ${w.y || '?'}` : t('lab.s.noPlayres', { w: def.width || LAYOUT_720P.width, h: def.height || LAYOUT_720P.height });
  };

  const info = (s: LabSession): HTMLElement => {
    const dl = el('dl', 'lab-kv');
    const fonts = [...new Set([...s.source.script.styles.values()].map((x) => x.fontName))];
    const source = s.header?.sourceBytes ?? s.blob.size;
    dl.append(
      kv(t('lab.file'), `${s.name} (${t(kindKey[s.kind])})`),
      kv(s.kind === 'ass' ? t('lab.s.orig') : `${t(kindKey[s.kind])}`, `${humanBytes(s.blob.size)} (${exactBytes(s.blob.size)})`),
      ...(s.kind === 'ass' ? [] : [kv(t('lab.s.orig'), s.header?.sourceBytes ? `${humanBytes(source)} (${exactBytes(source)})` : t('lab.s.none'))]),
      kv(t('lab.s.events'), s.source.eventCount.toLocaleString('en-US')),
      kv(t('lab.s.dur'), `${s.source.duration.toFixed(2)} s`),
      kv(t('lab.s.styles'), String(s.source.script.styles.size)),
      kv(t('lab.s.playres'), play),
      kv(t('lab.s.fonts'), fonts.join(', ') || t('lab.s.none')),
    );
    return dl;
  };

  const build = (): void => {
    panel.replaceChildren(el('h3', '', t('lab.size')));
    if (!session) { panel.append(el('p', 'hint', t('lab.s.empty'))); return; }
    const s = session;
    panel.append(info(s));
    playRes();
    if (!jobs || !chips) {
      const h = s.header;
      const fpsNote = h?.fps ? t('lab.s.containerFps', { fps: h.fps }) : '';
      panel.append(el('p', 'hint', t('lab.s.container', { kind: t(kindKey[s.kind]), size: humanBytes(s.blob.size), src: h?.sourceBytes ? humanBytes(h.sourceBytes) : '?', fps: fpsNote })), el('p', 'hint', t('lab.s.noEncode')));
      if (h?.notice) panel.append(el('p', 'hint err', h.notice));
      return;
    }
    panel.append(jobs.xparRow.root, el('p', 'hint', t('lab.s.parFps')), chips.root, jobs.parRow.root, el('p', 'hint', t('lab.s.xparNote')), el('p', 'hint', t('lab.s.parNote', { fps })));
    if (jobs.big) panel.append(el('p', 'hint', t('lab.s.big')));
    jobs.redraw();
  };

  return {
    setSession(s: LabSession | null): void {
      jobs?.dispose();
      jobs = null;
      chips = null;
      session = s;
      if (s && s.kind === 'ass') {
        jobs = new SizeJobs(client, s, () => fps);
        chips = fpsChips(PAR_MARKS, t('lab.s.custom'), (v) => { fps = v; chips?.set(v); jobs?.setFps(); build(); }, fps);
      }
      build();
      jobs?.start();
    },
    rebuild: build,
    playRes,
  };
};
