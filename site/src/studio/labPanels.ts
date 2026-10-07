/** Markup of the lab's folds that load on first open: fonts (report + library manager) and the subtitle editor. */

export const FONTS_HTML = `
<details class="st-fold" id="stFonts">
  <summary><span data-i18n="st.labFonts"></span></summary>
  <div class="row">
    <button type="button" class="btn sm" id="fontTestLoad" data-i18n="fonts.testLoad"></button>
    <button type="button" class="btn sm" id="fontTestSave" data-i18n="fonts.testSave"></button>
    <button type="button" class="btn sm" id="fontLocal" data-i18n="fonts.local" hidden></button>
  </div>
  <p class="hint" id="fontStatus" role="status"></p>
  <p class="hint err" id="fontMissing" role="alert"></p>
  <h3 class="sm" data-i18n="fonts.used"></h3>
  <ul class="fontlist" id="fontUsed"></ul>
  <h3 class="sm" data-i18n="fonts.loaded"></h3>
  <ul class="fontlist" id="fontLoaded"></ul>
  <p class="hint" data-i18n="fonts.how"></p>
  <section id="fontLib" class="fontlib"></section>
</details>`;

export const EDITOR_HTML = `
<details class="st-fold" id="stEditor">
  <summary><span data-i18n="st.edit"></span></summary>
  <p class="hint" data-i18n="st.editHint"></p>
  <textarea id="stAssText" spellcheck="false" rows="12" autocapitalize="off" autocomplete="off" data-i18n-attr="aria-label:st.edit"></textarea>
  <div class="row">
    <button type="button" class="btn sm" id="stAssFromSel" data-i18n="st.editFromSel"></button>
    <button type="button" class="btn sm" id="stAssNew" data-i18n="st.editNew"></button>
  </div>
</details>`;
