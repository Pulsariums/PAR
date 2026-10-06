import { blockName, blockStats, codeLabel, countAll, hasCp, sliceCps, type FontLibrary, type FontRecord } from '../../../src/fontlib';
import { t } from '../i18n/i18n';

import { button, el } from './dom';
import { faceCoverage, faceFamily } from './libFace';

const PAGE = 96;
const LISTED = 24;

export interface DetailDeps {
  lib: FontLibrary;
  /** Code points the current subtitle draws. */
  usedChars(): Promise<number[]>;
}

const chars = (cps: number[]): string => cps.slice(0, LISTED).map((c) => `${String.fromCodePoint(c)} ${codeLabel(c)}`).join(', ') + (cps.length > LISTED ? ', ...' : '');

/**
 * The character grid of one stored font: only one page of cells (96) is ever in the DOM however large the font is, a block
 * selector jumps to the Unicode blocks the font really has, a tap shows one character large with its code and block, and
 * the characters of the current subtitle are checked against the font's cmap.
 */
export const buildDetail = (rec: FontRecord, deps: DetailDeps): HTMLElement => {
  const root = el('div', 'libdetail');
  const status = el('p', 'hint', t('lib.loadingFace'));
  root.append(status);
  void Promise.all([faceCoverage(deps.lib, rec.id), faceFamily(deps.lib, rec)]).then(([cov, family]) => {
    if (!cov || !family) { status.textContent = t('lib.faceFailed'); status.classList.add('err'); return; }
    status.remove();
    fill(root, cov, family, deps);
  });
  return root;
};

const fill = (root: HTMLElement, cov: Uint32Array, family: string, deps: DetailDeps): void => {
  const total = countAll(cov);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  let page = 0;
  const cells = el('div', 'cells');
  const label = el('output', 'pagelabel');
  const big = el('div', 'bigchar');
  const info = el('p', 'hint', t('lib.pickChar'));
  info.setAttribute('aria-live', 'polite');
  const blocks = el('select');
  blocks.setAttribute('aria-label', t('lib.block'));
  for (const b of blockStats(cov)) blocks.append(Object.assign(el('option', '', `${b.name} (${b.count})`), { value: String(b.firstIndex) }));
  blocks.addEventListener('change', () => { page = Math.floor(Number(blocks.value) / PAGE); draw(); });

  const show = (cp: number): void => {
    big.style.fontFamily = `"${family}", monospace`;
    big.textContent = String.fromCodePoint(cp);
    info.textContent = `${t('lib.char')}: ${String.fromCodePoint(cp)} | ${t('lib.codepoint')}: ${codeLabel(cp)} (${cp}) | ${t('lib.blockName')}: ${blockName(cp) || '-'}`;
  };
  const draw = (): void => {
    cells.replaceChildren(...sliceCps(cov, page * PAGE, PAGE).map((cp) => {
      const b = button(String.fromCodePoint(cp), () => show(cp), 'cell');
      b.style.fontFamily = `"${family}", monospace`;
      b.setAttribute('aria-label', `${String.fromCodePoint(cp)} ${codeLabel(cp)}`);
      return b;
    }));
    label.textContent = t('lib.page', { a: page + 1, b: pages });
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
  };
  const prev = button(t('lib.prev'), () => { page--; draw(); });
  const next = button(t('lib.next'), () => { page++; draw(); });
  const pager = el('div', 'row pager');
  pager.append(blocks, prev, label, next);

  const used = el('p', 'hint');
  void deps.usedChars().then((cps) => {
    const missing = cps.filter((c) => !hasCp(cov, c));
    used.textContent = !cps.length ? t('lib.usedNone') : missing.length ? t('lib.usedMissing', { n: missing.length, total: cps.length, list: chars(missing) }) : t('lib.usedOk', { n: cps.length });
    used.classList.toggle('err', missing.length > 0);
  });
  root.append(el('h4', 'sm', `${t('lib.gridTitle')} (${t('lib.glyphsN', { n: total })})`), used, pager, cells, big, info);
  draw();
};
