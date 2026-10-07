import { initMatrix } from '../player/matrix';
import { buildSnippet, copyButton, type SnippetInput } from '../player/snippet';
import { $ } from '../player/dom';

/** Markup of the reference panel (lab view): the feature matrix and the `create(...)` call for the current choices. */
export const REFERENCE_HTML = `
<details class="st-fold" id="stReference">
  <summary><span data-i18n="st.ref"></span></summary>
  <h3 class="sm" data-i18n="tab.matrix"></h3>
  <p class="hint" data-i18n="mx.intro"></p>
  <ul class="matrix" id="matrix"></ul>
  <h3 class="sm" data-i18n="tab.code"></h3>
  <p class="hint" data-i18n="code.intro"></p>
  <pre class="code"><code id="snippet"></code></pre>
  <button type="button" class="btn primary" id="copy" data-i18n="code.copy"></button>
</details>`;

/** Wires the matrix (each row plays its preset in the Studio) and the code box (rebuilt on `refresh`). */
export const initReference = (input: () => SnippetInput, test: (presetId: string) => void) => {
  initMatrix(test);
  const code = $('snippet');
  copyButton($<HTMLButtonElement>('copy'), () => code.textContent ?? '');
  const refresh = (): void => { code.textContent = buildSnippet(input()); };
  refresh();
  return { refresh };
};
