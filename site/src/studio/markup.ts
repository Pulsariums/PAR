import { ADVANCED_HTML } from './advanced';
import { LAYOUT_HTML, METRICS_HTML } from './panelsMarkup';
import { EDITOR_HTML, FONTS_HTML } from './labPanels';
import { ANALYZE_HTML } from './analyze/ui';
import { OPTIMIZE_HTML } from './optimize/ui';
import { PERF_HTML } from './perf/ui';
import { REFERENCE_HTML } from './reference';
import { transportMarkup } from './transportMarkup';

const SHELVES = ['Videos', 'Subs', 'Fonts'] as const;
const KEY = { Videos: 'st.videos', Subs: 'st.subs', Fonts: 'st.fonts' } as const;

/** Static markup of the Studio (ids use the `st` prefix; shelves, export panel and the two collapsible panels are filled by the studio modules). */
export const STUDIO_HTML = `
<div class="st-top">
  <h2 data-i18n="st.title"></h2>
  <div class="seg" role="group" id="stView" data-i18n-attr="aria-label:st.view">
    <button type="button" data-view="watch" aria-pressed="true" data-i18n="st.view.watch"></button>
    <button type="button" data-view="lab" aria-pressed="false" data-i18n="st.view.lab"></button>
  </div>
</div>
<p class="lead sm" data-i18n="st.sub"></p>
<div class="st" id="st" data-view="watch">
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
    <p class="hint st-heavy st-lab" id="stHeavy" role="status" hidden></p>
    ${transportMarkup()}
  </div>
  <div class="st-side">
    <div class="seg block st-tabs" role="tablist" data-i18n-attr="aria-label:st.shelves">
      ${SHELVES.map((s, i) => `<button type="button" role="tab" id="stTab${s}" data-shelf="${s}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" aria-controls="stShelf${s}" data-i18n="${KEY[s]}"></button>`).join('')}
    </div>
    ${SHELVES.map((s, i) => `<section class="st-panel st-shelf${i === 0 ? ' on' : ''}" id="stShelf${s}" role="tabpanel" aria-labelledby="stTab${s}"></section>`).join('')}
    <section class="st-panel st-lab" id="stExport"></section>
  </div>
  <div class="st-panels">
    <div class="st-lab">${ADVANCED_HTML}</div>
    <div id="stFontPrompt" class="fontprompt"></div>
    <p class="hint" data-i18n="st.keys"></p>
    <div class="st-lab">${EDITOR_HTML}${OPTIMIZE_HTML}${ANALYZE_HTML}${FONTS_HTML}${METRICS_HTML}${PERF_HTML}${LAYOUT_HTML}${REFERENCE_HTML}</div>
  </div>
</div>`;
