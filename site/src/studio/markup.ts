import { ADVANCED_HTML } from './advanced';
import { LAYOUT_HTML, METRICS_HTML } from './panelsMarkup';
import { transportMarkup } from './transportMarkup';

const SHELVES = ['Videos', 'Subs', 'Fonts'] as const;
const KEY = { Videos: 'st.videos', Subs: 'st.subs', Fonts: 'st.fonts' } as const;

/** Static markup of the Studio (ids use the `st` prefix; shelves, export panel and the two collapsible panels are filled by the studio modules). */
export const STUDIO_HTML = `
<h2 data-i18n="st.title"></h2>
<p class="lead sm" data-i18n="st.sub"></p>
<div class="st" id="st">
  <div class="st-player">
    <div class="row st-bar">
      <label class="fld inline"><span data-i18n="st.examples"></span><select id="stExamples"></select></label>
      <span class="status system" id="stMode"></span>
      <button type="button" class="btn sm" id="stGenCancel" data-i18n="st.cancel" hidden></button>
    </div>
    <div class="stage st-stage" id="stStage" tabindex="0" role="application" data-i18n-attr="aria-label:st.stage">
      <canvas id="stCard" aria-hidden="true"></canvas><video id="stVid" playsinline hidden></video>
      <div class="st-frame" id="stFrame" hidden aria-hidden="true"><span class="st-tag" id="stFrameTag"></span></div>
    </div>
    <p class="hint st-status" id="stStatus" role="status" aria-live="polite"></p>
    <p class="hint st-heavy" id="stHeavy" role="status" hidden></p>
    ${transportMarkup()}
  </div>
  <div class="st-side">
    <div class="seg block st-tabs" role="tablist" data-i18n-attr="aria-label:st.shelves">
      ${SHELVES.map((s, i) => `<button type="button" role="tab" id="stTab${s}" data-shelf="${s}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" aria-controls="stShelf${s}" data-i18n="${KEY[s]}"></button>`).join('')}
    </div>
    ${SHELVES.map((s, i) => `<section class="st-panel st-shelf${i === 0 ? ' on' : ''}" id="stShelf${s}" role="tabpanel" aria-labelledby="stTab${s}"></section>`).join('')}
    <section class="st-panel" id="stExport"></section>
  </div>
  <div class="st-panels">
    ${ADVANCED_HTML}
    <div id="stFontPrompt" class="fontprompt"></div>
    <p class="hint" data-i18n="st.keys"></p>
    ${METRICS_HTML}${LAYOUT_HTML}
  </div>
</div>`;
