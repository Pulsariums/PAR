import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMissingFontsPrompt, type PreflightReport } from '../src/index';

const entry = (name: string) => ({ name, status: 'missing' as const, family: '', verified: true, mapped: false, syntheticBold: false, syntheticItalic: false, styles: [], lineCount: 1 });
const report = (names: string[], glyphs: string[] = []): PreflightReport => ({
  ok: names.length === 0, resolved: [], missing: names.map(entry), synthetic: [], providerHits: {},
  missingGlyphs: Object.fromEntries(glyphs.map((g) => [g, { count: 1, sample: [0x41f] }])), warnings: [], stats: { lines: 0, events: 0, fonts: names.length },
});

const host = (): HTMLElement => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
afterEach(() => { document.body.innerHTML = ''; });

describe('createMissingFontsPrompt', () => {
  it('shows the missing names as text, with an accessible, non-modal alertdialog and real buttons', () => {
    const p = createMissingFontsPrompt(host(), report(['Arial Black', '<b>Evil</b>']), { onContinue: () => {}, onAddFonts: () => {} });
    const root = p.element;
    expect(root.getAttribute('role')).toBe('alertdialog');
    expect(root.getAttribute('aria-modal')).toBe('false');
    expect(document.getElementById(root.getAttribute('aria-labelledby')!)!.textContent).toBe('Font is missing');
    expect(document.getElementById(root.getAttribute('aria-describedby')!)!.textContent).toBe('These fonts are missing: Arial Black, <b>Evil</b>. Continue anyway?');
    expect(root.querySelectorAll('li')).toHaveLength(2);
    expect(root.querySelector('b')).toBeNull(); // names are never parsed as HTML
    const buttons = [...root.querySelectorAll('button')];
    expect(buttons.map((b) => [b.textContent, b.type, b.hidden])).toEqual([['Continue', 'button', false], ['Add font', 'button', false]]);
  });

  it('buttons call the callbacks; Escape dismisses (default: removes, or onDismiss)', () => {
    const [onContinue, onAddFonts, onDismiss] = [vi.fn(), vi.fn(), vi.fn()];
    const p = createMissingFontsPrompt(host(), report(['X']), { onContinue, onAddFonts, onDismiss });
    const [c, a] = [...p.element.querySelectorAll('button')];
    c.click();
    a.click();
    expect([onContinue.mock.calls.length, onAddFonts.mock.calls.length]).toEqual([1, 1]);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    const q = createMissingFontsPrompt(host(), report(['Y']), { onContinue, onAddFonts });
    q.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q.element.isConnected).toBe(false);
  });

  it('texts are replaceable (i18n), update() swaps the report, glyph warning appears only with a glyphs text', () => {
    const p = createMissingFontsPrompt(host(), report(['A']), {
      onContinue: () => {}, onAddFonts: () => {}, autofocus: true,
      texts: { title: 'Yazı tipi eksik', message: '{count} font eksik: {names}. Devam edilsin mi?', continueLabel: 'Devam et', addLabel: 'Font ekle', glyphs: 'Karakter eksik: {names}' },
    });
    expect(p.element.querySelector('h4')!.textContent).toBe('Yazı tipi eksik');
    expect(document.activeElement!.textContent).toBe('Devam et');
    p.update(report(['A', 'B'], ['Cyr']));
    expect(p.element.querySelector('p')!.textContent).toBe('2 font eksik: A, B. Devam edilsin mi?');
    const glyphs = p.element.querySelector<HTMLElement>('.par-missing-prompt-glyphs')!;
    expect([glyphs.hidden, glyphs.textContent]).toEqual([false, 'Karakter eksik: Cyr']);
    p.update(report(['A']));
    expect(glyphs.hidden).toBe(true);
    p.destroy();
    expect(document.body.querySelector('.par-missing-prompt')).toBeNull();
  });
});
