import type { Dict } from '../i18n/en';
import { t } from '../i18n/i18n';
import { el } from '../playground/dom';
import { PAR_MARKS, fpsChips, type Chips } from '../playground/fpsMarks';

import { defaultFps, exportBlockers, type SubKind } from './exportPlan';
import { containerNotes, playResText, sessionInfo } from './exportInfo';
import type { StudioSession } from './session';
import type { SizeClient } from './size/client';
import { SizeJobs } from './size/jobs';

const WHY: Record<string, keyof Dict> = { none: 'st.why.none', isXpar: 'st.why.isXpar', needAss: 'st.why.needAss', isPar: 'st.why.isPar' };
const dlLabel = (k: 'xpar' | 'par', fps: number): string => (k === 'xpar' ? t('st.exXpar') : t('st.exPar', { fps }));

/**
 * The ONE size and export panel under the shelves: what the selected subtitle is (ASS size, events, PlayRes ...), then the XPAR size (lossless)
 * and the PAR size at the chosen fps (exact or estimated, progress, cancel) and the two downloads. XPAR / PAR files cannot be re-encoded
 * (a PAR has lost the ASS): their buttons are disabled with the reason.
 */
export const initExportPanel = (host: HTMLElement, client: () => SizeClient, getDefault: () => { width: number; height: number }) => {
  let session: StudioSession | null = null;
  let jobs: SizeJobs | null = null;
  let chips: Chips | null = null;
  let picked: number | null = null;
  let video: number | null = null;
  const fps = (): number => defaultFps(picked, video);
  const note = el('p', 'hint');
  const playRes = el('span');

  const noteText = (): string => (picked !== null ? t('st.fpsPicked', { fps: picked }) : video !== null ? t('st.fpsVideo', { fps: video }) : t('st.fpsDefault', { fps: fps() }));
  const refreshPlayRes = (): void => { if (session) playRes.textContent = playResText(session, getDefault()); };

  const disabled = (kind: SubKind | null): void => {
    const b = exportBlockers(kind);
    const mk = (label: string, why: string | null): HTMLButtonElement => Object.assign(el('button', 'btn sm'), { type: 'button', disabled: true, textContent: label, title: why ? t(WHY[why]!) : '' });
    const row = el('div', 'row');
    row.append(mk(t('st.exPar', { fps: fps() }), b.par), mk(t('st.exXpar'), b.xpar));
    host.append(row, ...[b.par, b.xpar].filter((w): w is string => w !== null).map((w) => el('p', 'hint', t(WHY[w]!))));
  };

  const build = (): void => {
    host.replaceChildren(el('h3', '', t('st.export')));
    if (session) { host.append(sessionInfo(session, playRes)); refreshPlayRes(); } else host.append(el('p', 'hint', t('st.s.empty')));
    if (!session || !jobs || !chips) {
      if (session) host.append(...containerNotes(session));
      disabled(session?.kind ?? null);
      return;
    }
    note.textContent = noteText();
    host.append(el('div', 'fld', t('st.s.parFps')), chips.root, note, jobs.parRow.root, jobs.xparRow.root, el('p', 'hint', t('st.s.xparNote')), el('p', 'hint', t('st.s.parNote', { fps: fps() })));
    if (jobs.big) host.append(el('p', 'hint', t('st.s.big')));
    jobs.redraw();
  };

  const refps = (): void => { chips?.set(fps()); jobs?.setFps(); build(); };

  build();
  return {
    setSession(s: StudioSession | null): void {
      jobs?.dispose();
      jobs = null;
      chips = null;
      session = s;
      if (s?.kind === 'ass') {
        jobs = new SizeJobs(client(), s, fps, dlLabel);
        chips = fpsChips(PAR_MARKS, t('st.s.custom'), (v) => { picked = v; refps(); }, fps());
      }
      build();
      jobs?.start();
    },
    /** The video frame rate in use (picked or detected, or null): becomes the export default unless the user picked an export rate. */
    setVideoFps(f: number | null): void { video = f; if (jobs) refps(); else build(); },
    /** The default size of the layout panel changed (it decides the PlayRes line of a script without PlayRes). */
    playRes: refreshPlayRes,
    rebuild: build,
  };
};
