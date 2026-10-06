import type { FontReportEntry, FontStatus, LoadedFont } from '../../../src/index';
import { t } from '../i18n/i18n';
import type { Dict } from '../i18n/en';
import { TEST_FAMILY, testFontBytes } from '../presets/fonts';

import type { Player } from './player';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const KEY: Record<FontStatus, keyof Dict> = { embedded: 'st.embedded', user: 'st.user', local: 'st.local', system: 'st.system', missing: 'st.missing' };
const CLASS: Record<FontStatus, string> = { embedded: 'rendered', user: 'rendered', local: 'rendered', system: 'system', missing: 'unsupported' };

const el = (tag: string, cls = '', text = ''): HTMLElement => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};
const chip = (s: FontStatus): HTMLElement => el('span', `status ${CLASS[s]}`, t(KEY[s]));

/** Notes under a used font: synthetic bold/italic, unverifiable probe, size factor. Names come from files: textContent only. */
const notes = (f: FontReportEntry): string => {
  const synth = [f.syntheticBold ? t('fonts.bold') : '', f.syntheticItalic ? t('fonts.italic') : ''].filter(Boolean).join(' + ');
  return [
    t('fonts.by', { styles: f.styles.join(', '), lines: f.lines.length }),
    synth ? t('fonts.synth', { what: synth }) : '',
    !f.verified ? t('fonts.unverified') : '',
    `\\fs x ${Math.round(f.sizeRatio * 1000) / 1000} (${f.ratioSource})`,
  ].filter(Boolean).join(' | ');
};

const usedRow = (f: FontReportEntry): HTMLElement => {
  const li = el('li');
  li.append(chip(f.status), el('b', 'fname', f.name), el('span', 'fnote', notes(f)));
  return li;
};

/** Fonts tab: add files (picker, drop, generated test font), list what the script needs, list what is loaded. */
export const initFonts = (player: Player) => {
  const par = player.par;
  const status = $<HTMLParagraphElement>('fontStatus');
  const say = (msg: string) => { status.textContent = msg; };

  const loadedRow = (f: LoadedFont): HTMLElement => {
    const li = el('li');
    const state = f.state === 'loaded' ? '' : f.state === 'loading' ? t('fonts.loading') : `${t('fonts.failed')}: ${f.error ?? ''}`;
    li.append(chip(f.source), el('b', 'fname', f.family), el('span', 'fnote', [`${f.weight}${f.italic ? ' italic' : ''}`, f.label, state].filter(Boolean).join(' | ')));
    if (f.source === 'user') {
      const b = el('button', 'btn sm', t('fonts.remove')) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => par.removeFont(f.id));
      li.append(b);
    }
    return li;
  };

  const draw = () => {
    const report = par.getFontReport();
    const used = $('fontUsed');
    used.replaceChildren(...(report.fonts.length ? report.fonts.map(usedRow) : [el('li', 'muted', t('fonts.noneUsed'))]));
    const loaded = par.listFonts();
    $('fontLoaded').replaceChildren(...(loaded.length ? loaded.map(loadedRow) : [el('li', 'muted', t('fonts.noneLoaded'))]));
    $('fontMissing').textContent = report.missing.length ? t('fonts.missing', { names: report.missing.join(', ') }) : '';
    if (report.pending) say(t('fonts.loading'));
    else if (status.textContent === t('fonts.loading')) say('');
  };

  const add = async (files: File[]) => {
    say(t('fonts.loading'));
    const res = await par.addFonts(files);
    const ok = res.reduce((n, r) => n + r.fonts.length, 0);
    const errs = res.filter((r) => r.error).map((r) => t('fonts.error', { name: r.name, error: r.error ?? '' }));
    say([t('fonts.added', { n: ok }), ...errs].join(' '));
    draw();
  };

  $<HTMLInputElement>('fontFiles').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    void add(Array.from(input.files ?? []));
    input.value = '';
  });
  $('fontTestLoad').addEventListener('click', () => void add([new File([testFontBytes() as BlobPart], `${TEST_FAMILY}.ttf`, { type: 'font/ttf' })]));
  $('fontTestSave').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([testFontBytes() as BlobPart], { type: 'font/ttf' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${TEST_FAMILY.replace(/ /g, '-')}.ttf` });
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const localBtn = $<HTMLButtonElement>('fontLocal');
  localBtn.hidden = !('queryLocalFonts' in window);
  localBtn.addEventListener('click', async () => {
    say((await par.loadLocalFonts()) ? t('fonts.localOk') : t('fonts.localFail'));
    draw();
  });
  par.onFontsChange(draw);
  return { draw, add };
};
