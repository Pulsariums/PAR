import { t } from '../i18n/i18n';
import { $ } from '../player/dom';
import { presetById } from '../presets';

/** Editing text bigger than this is not offered (a textarea of a 30 MB script would freeze the page). */
const MAX_EDIT_BYTES = 256 * 1024;
const DEBOUNCE_MS = 600;
export const SCRATCH = 'scratch.ass';

/**
 * The subtitle editor: type ASS and see it play. The text is kept on the shelf as one item, `scratch.ass`, replaced on every pause in
 * typing, so it plays, sizes and exports like any other subtitle (one source of truth: the shelf).
 */
export const initEditor = (host: { upsert(file: File): Promise<void>; selectedFile(): File | null }, status: (msg: string) => void) => {
  const area = $<HTMLTextAreaElement>('stAssText');
  let timer = 0;
  const commit = (): void => { window.clearTimeout(timer); void host.upsert(new File([area.value], SCRATCH, { type: 'text/plain' })); };
  area.addEventListener('input', () => { window.clearTimeout(timer); timer = window.setTimeout(commit, DEBOUNCE_MS); });
  $('stAssFromSel').addEventListener('click', async () => {
    const f = host.selectedFile();
    if (!f) { status(t('st.editNone')); return; }
    if (f.size > MAX_EDIT_BYTES) { status(t('st.editBig', { name: f.name })); return; }
    area.value = await f.text();
    status(t('st.editLoaded', { name: f.name }));
  });
  $('stAssNew').addEventListener('click', () => { area.value = presetById('basic')?.ass ?? ''; commit(); });
};
