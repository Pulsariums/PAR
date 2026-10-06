/** Static markup of the Lab section (texts come from data-i18n keys; dynamic parts are filled by the lab* modules). */

import { transportMarkup } from './labTransportMarkup';

const TRANSPORT = transportMarkup('lab', `<button type="button" class="btn sm" id="labVideoBtn" data-i18n="lab.video"></button>
    <input id="labVideoFile" type="file" accept="video/*" hidden />`) + `
  <div class="fld"><span data-i18n="lab.renderFps"></span>
    <div class="fpsrow">
      <label class="chk"><input id="labFpsAuto" type="checkbox" checked /><span data-i18n="lab.auto"></span></label>
      <input id="labFps" type="range" min="10" max="200" step="1" value="60" list="labFpsMarks" data-i18n-attr="aria-label:lab.renderFps" />
      <output id="labFpsOut" class="mono">auto</output>
    </div>
    <datalist id="labFpsMarks"></datalist>
    <div id="labFpsChips"></div>
  </div>
  <div class="fld"><span data-i18n="lab.videoFps"></span><div id="labVideoFpsChips"></div></div>
  <p class="hint" data-i18n="lab.keys"></p>`;

const FILE = `
  <h3 data-i18n="lab.file"></h3>
  <div class="lab-drop" id="labDrop">
    <span data-i18n="lab.drop"></span>
    <button type="button" class="btn primary" id="labPick" data-i18n="lab.pick"></button>
    <input id="labFile" type="file" accept=".ass,.ssa,.xpar,.par,.txt" hidden />
  </div>
  <div class="row lab-gen">
    <label class="fld"><span data-i18n="lab.genSize"></span>
      <select id="labGenSize"><option value="5">5 MB</option><option value="10">10 MB</option><option value="50">50 MB</option><option value="100" selected>100 MB</option><option value="200">200 MB</option></select></label>
    <button type="button" class="btn sm" id="labGen" data-i18n="lab.gen"></button>
    <button type="button" class="btn sm" id="labFontsBtn" data-i18n="lab.addFonts"></button>
    <input id="labFontFiles" type="file" multiple accept=".ttf,.otf,.ttc,.otc,.woff,.woff2,.zip" hidden />
  </div>
  <p class="hint" data-i18n="lab.genHint"></p>
  <div class="lab-progress" id="labProgress" hidden>
    <div class="qbar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="labProgressBar"></i></div>
    <button type="button" class="btn sm" id="labCancel" data-i18n="lab.cancel"></button>
  </div>
  <p class="hint" id="labStatus" role="status"></p>`;

const LAYOUT = `
  <h3 data-i18n="lab.lay"></h3>
  <dl class="lab-kv" id="labLayKv"></dl>
  <div class="fld"><span data-i18n="lab.l.default"></span>
    <div class="seg block" role="group" id="labDefault" data-i18n-attr="aria-label:lab.l.default">
      <button type="button" data-def="1080p" aria-pressed="true" data-i18n="lab.l.d1080"></button>
      <button type="button" data-def="720p" aria-pressed="false" data-i18n="lab.l.d720"></button>
      <button type="button" data-def="libass" aria-pressed="false" data-i18n="lab.l.dlibass"></button>
      <button type="button" data-def="custom" aria-pressed="false" data-i18n="lab.l.dcustom"></button>
    </div>
    <div class="row" id="labDefaultRow" hidden>
      <label class="fld"><span data-i18n="lab.l.w"></span><input id="labDefW" type="number" min="1" value="1920" inputmode="numeric" /></label>
      <label class="fld"><span data-i18n="lab.l.h"></span><input id="labDefH" type="number" min="1" value="1080" inputmode="numeric" /></label>
    </div>
  </div>
  <div class="fld"><span data-i18n="lab.l.override"></span>
    <div class="seg block" role="group" id="labOverride" data-i18n-attr="aria-label:lab.l.override">
      <button type="button" data-ov="off" aria-pressed="true" data-i18n="lab.l.oOff"></button>
      <button type="button" data-ov="custom" aria-pressed="false" data-i18n="lab.l.oCustom"></button>
    </div>
    <div class="row" id="labOverrideRow" hidden>
      <label class="fld"><span data-i18n="lab.l.w"></span><input id="labOvW" type="number" min="1" value="1920" inputmode="numeric" /></label>
      <label class="fld"><span data-i18n="lab.l.h"></span><input id="labOvH" type="number" min="1" value="1080" inputmode="numeric" /></label>
    </div>
  </div>
  <label class="chk"><input id="labOverlay" type="checkbox" /><span data-i18n="lab.l.overlay"></span></label>
  <p class="hint" data-i18n="lab.l.explain"></p>`;

export const LAB_HTML = `
<h2 data-i18n="lab.title"></h2>
<p class="lead sm" data-i18n="lab.sub"></p>
<div class="lab" id="lab">
  <div class="lab-main">
    <div class="lab-view">
      <div class="stage lab-stage" id="labStage" tabindex="0" role="application" data-i18n-attr="aria-label:lab.stage">
        <canvas id="labCard" aria-hidden="true"></canvas><video id="labVid" playsinline hidden></video>
        <div class="lab-frame" id="labFrame" hidden aria-hidden="true"><span class="lab-tag" id="labFrameTag"></span></div>
      </div>
      ${TRANSPORT}
    </div>
    <div id="labFontPrompt" class="fontprompt"></div>
    <dl class="metrics" id="labStats"></dl>
  </div>
  <div class="lab-side">
    <section class="lab-panel">${FILE}</section>
    <section class="lab-panel" id="labSizePanel"></section>
    <section class="lab-panel">${LAYOUT}</section>
  </div>
</div>`;
