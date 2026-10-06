import { t } from '../i18n/i18n';
import type { Dict } from '../i18n/en';
import { el } from '../playground/dom';
import { PAR_MARKS, fpsChips, type Chips } from '../playground/fpsMarks';
import { SizeJobs } from '../playground/labSizeJobs';
import { SizeClient } from '../playground/labSizeClient';
import type { LabSession } from '../playground/labTypes';

import { defaultFps, exportBlockers, type SubKind } from './exportPlan';

const WHY: Record<string, keyof Dict> = { none: 'st.why.none', isXpar: 'st.why.isXpar', needAss: 'st.why.needAss', isPar: 'st.why.isPar' };
const dlLabel = (k: 'xpar' | 'par', fps: number): string => (k === 'xpar' ? t('st.exXpar') : t('st.exPar', { fps }));

/**
 * Export panel under the shelves: "Export PAR" (lossy, fps selector) and "Export XPAR" (lossless) of the selected subtitle, with progress, cancel
 * and size vs the original ASS. All of it is the Lab's SizeJobs. XPAR / PAR files cannot be re-encoded (a PAR has lost the ASS): disabled with the reason.
 */
export const initExportPanel = (host: HTMLElement) => {
  let client: SizeClient | null = null;
  let session: LabSession | null = null;
  let jobs: SizeJobs | null = null;
  let chips: Chips | null = null;
  let picked: number | null = null;
  let detected: number | null = null;
  const fps = (): number => defaultFps(picked, detected);
  const note = el('p', 'hint');

  const noteText = (): string => (picked !== null ? t('st.fpsPicked', { fps: picked }) : detected !== null ? t('st.fpsVideo', { fps: detected }) : t('st.fpsDefault', { fps: fps() }));

  const disabled = (kind: SubKind | null): void => {
    const b = exportBlockers(kind);
    const mk = (label: string, why: string | null): HTMLButtonElement => Object.assign(el('button', 'btn sm'), { type: 'button', disabled: true, textContent: label, title: why ? t(WHY[why]!) : '' });
    const row = el('div', 'row');
    row.append(mk(t('st.exPar', { fps: fps() }), b.par), mk(t('st.exXpar'), b.xpar));
    host.append(row, ...[b.par, b.xpar].filter((w): w is string => w !== null).map((w) => el('p', 'hint', t(WHY[w]!))));
  };

  const build = (): void => {
    host.replaceChildren(el('h3', '', t('st.export')));
    if (!session || !jobs || !chips) { disabled(session?.kind ?? null); return; }
    note.textContent = noteText();
    host.append(el('div', 'fld', t('lab.s.parFps')), chips.root, note, jobs.parRow.root, jobs.xparRow.root, el('p', 'hint', t('lab.s.xparNote')), el('p', 'hint', t('lab.s.parNote', { fps: fps() })));
    if (jobs.big) host.append(el('p', 'hint', t('lab.s.big')));
    jobs.redraw();
  };

  const refps = (): void => { chips?.set(fps()); jobs?.setFps(); build(); };

  build();
  return {
    setSession(s: LabSession | null): void {
      jobs?.dispose();
      jobs = null;
      chips = null;
      session = s;
      if (s?.kind === 'ass') {
        client ??= new SizeClient();
        jobs = new SizeJobs(client, s, fps, dlLabel);
        chips = fpsChips(PAR_MARKS, t('lab.s.custom'), (v) => { picked = v; refps(); }, fps());
      }
      build();
      jobs?.start();
    },
    /** The video changed: its detected frame rate (or null) becomes the default unless the user picked one. */
    setDetected(f: number | null): void { detected = f; if (jobs) refps(); else build(); },
    rebuild: build,
  };
};
