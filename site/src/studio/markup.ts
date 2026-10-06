import { transportMarkup } from '../playground/labTransportMarkup';

const SHELVES = ['Videos', 'Subs', 'Fonts'] as const;
const KEY = { Videos: 'st.videos', Subs: 'st.subs', Fonts: 'st.fonts' } as const;

/** Static markup of the Studio section (ids use the `st` prefix; the shelves and the export panel are filled by the studio modules). */
export const STUDIO_HTML = `
<h2 data-i18n="st.title"></h2>
<p class="lead sm" data-i18n="st.sub"></p>
<div class="st" id="st">
  <div class="st-main">
    <div class="stage lab-stage" id="stStage" tabindex="0" role="application" data-i18n-attr="aria-label:lab.stage">
      <canvas id="stCard" aria-hidden="true"></canvas><video id="stVid" playsinline hidden></video>
    </div>
    <p class="hint st-status" id="stStatus" role="status" aria-live="polite"></p>
    ${transportMarkup('st')}
    <div id="stFontPrompt" class="fontprompt"></div>
    <p class="hint" data-i18n="lab.keys"></p>
  </div>
  <div class="st-side">
    <div class="seg block st-tabs" role="tablist" data-i18n-attr="aria-label:st.shelves">
      ${SHELVES.map((s, i) => `<button type="button" role="tab" id="stTab${s}" data-shelf="${s}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" aria-controls="stShelf${s}" data-i18n="${KEY[s]}"></button>`).join('')}
    </div>
    ${SHELVES.map((s, i) => `<section class="lab-panel st-shelf${i === 0 ? ' on' : ''}" id="stShelf${s}" role="tabpanel" aria-labelledby="stTab${s}"></section>`).join('')}
    <section class="lab-panel" id="stExport"></section>
  </div>
</div>`;
