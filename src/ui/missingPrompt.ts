import type { PreflightReport } from '../preflight/types';

/** Every string the prompt shows. `message` may contain `{count}` and `{names}`. Pass your own translations. */
export interface MissingPromptTexts {
  title: string;
  message: string;
  continueLabel: string;
  addLabel: string;
  /** Label of the optional close action (Escape key). */
  dismissLabel?: string;
  /** Warning about fonts that exist but lack characters the script draws; `{names}` = those families. Optional (no warning without it). */
  glyphs?: string;
  /** Title used when only glyphs are missing (no font is). */
  glyphsTitle?: string;
}

export interface MissingPromptOptions {
  onContinue(): void;
  onAddFonts(): void;
  /** Escape / close. Default: removes the prompt without deciding. */
  onDismiss?(): void;
  texts?: Partial<MissingPromptTexts>;
  /** Move focus to the first button when shown. Default false (never steal focus unasked). */
  autofocus?: boolean;
  /** CSS class of the root. Default `par-missing-prompt`. */
  className?: string;
}

export interface MissingPrompt {
  readonly element: HTMLElement;
  /** Shows a new report (names and text are replaced). */
  update(report: PreflightReport): void;
  destroy(): void;
}

const EN: MissingPromptTexts = {
  title: 'Font is missing',
  message: 'These fonts are missing: {names}. Continue anyway?',
  continueLabel: 'Continue',
  addLabel: 'Add font',
  glyphs: 'These fonts lack some characters used here: {names}.',
  glyphsTitle: 'Characters are missing',
};

const fill = (tpl: string, vars: Record<string, string>): string => tpl.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');

let counter = 0;

/**
 * A small, framework-free, non-modal prompt: "Font X is missing. Continue anyway? [Continue] [Add font]". PAR itself
 * never shows UI; hosts call this from `par.on('missingfonts', ...)`. A11y: `role="alertdialog"` (not modal) labelled by
 * its title and described by its message, real `<button>`s that are always visible (touch and keyboard friendly, no
 * hover-only controls), Escape closes it, names are inserted as text (never HTML). Style the classes
 * `par-missing-prompt`, `-title`, `-message`, `-names`, `-actions` yourself; the helper adds no CSS.
 */
export const createMissingFontsPrompt = (container: HTMLElement, report: PreflightReport, opts: MissingPromptOptions): MissingPrompt => {
  const doc = container.ownerDocument;
  const t: MissingPromptTexts = { ...EN, ...opts.texts };
  const cls = opts.className ?? 'par-missing-prompt';
  const id = `par-mp-${++counter}`;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, c: string, text = ''): HTMLElementTagNameMap[K] => {
    const n = doc.createElement(tag);
    n.className = `${cls}-${c}`;
    if (text) n.textContent = text;
    return n;
  };
  const root = doc.createElement('div');
  root.className = cls;
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-labelledby', `${id}-t`);
  root.setAttribute('aria-describedby', `${id}-m`);
  const title = make('h4', 'title', t.title);
  title.id = `${id}-t`;
  const message = make('p', 'message');
  message.id = `${id}-m`;
  const list = make('ul', 'names');
  const glyphs = make('p', 'glyphs');
  const button = (label: string, kind: string, fn: () => void): HTMLButtonElement => {
    const b = make('button', kind, label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const actions = make('div', 'actions');
  const add = button(t.addLabel, 'add', () => opts.onAddFonts());
  actions.append(button(t.continueLabel, 'continue', () => opts.onContinue()), add);
  root.append(title, message, list, glyphs, actions);
  const dismiss = (): void => { if (opts.onDismiss) opts.onDismiss(); else destroy(); };
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); dismiss(); } });
  const update = (r: PreflightReport): void => {
    const names = r.missing.map((m) => m.name);
    const only = names.length === 0;
    title.textContent = only ? t.glyphsTitle ?? t.title : t.title;
    message.hidden = only;
    message.textContent = fill(t.message, { names: names.join(', '), count: String(names.length) });
    list.replaceChildren(...names.map((n) => make('li', 'name', n)));
    const lacking = Object.keys(r.missingGlyphs);
    glyphs.textContent = lacking.length && t.glyphs ? fill(t.glyphs, { names: lacking.join(', ') }) : '';
    glyphs.hidden = !glyphs.textContent;
  };
  const destroy = (): void => root.remove();
  update(report);
  container.append(root);
  if (opts.autofocus) (actions.firstElementChild as HTMLElement).focus();
  return { element: root, update, destroy };
};
