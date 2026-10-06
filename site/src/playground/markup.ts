/** Static markup of the playground (texts come from data-i18n keys). */

const num = (id: string, key: string, value: string, attrs = '') =>
  `<label class="fld"><span data-i18n="${key}"></span><input id="${id}" type="number" inputmode="decimal" value="${value}" ${attrs} /></label>`;

const SOURCE = `
  <div class="seg block" role="group" data-i18n-attr="aria-label:src.label">
    <button type="button" data-src="card" aria-pressed="true" data-i18n="src.card"></button>
    <button type="button" data-src="file" aria-pressed="false" data-i18n="src.file"></button>
    <button type="button" data-src="url" aria-pressed="false" data-i18n="src.url"></button>
  </div>
  <p class="hint" id="srcHint" data-i18n="src.cardHint"></p>
  <div class="row" id="srcFile" hidden>
    <label class="fld grow"><span data-i18n="src.pick"></span><input id="videoFile" type="file" accept="video/*" /></label>
  </div>
  <div class="row" id="srcUrl" hidden>
    <label class="fld grow"><span data-i18n="src.urlLabel"></span><input id="videoUrl" type="url" placeholder="https://example.com/video.mp4" /></label>
    <button type="button" class="btn" id="videoUrlGo" data-i18n="src.load"></button>
  </div>
  <p class="hint" id="srcStatus" role="status"></p>
  <p class="hint" data-i18n="src.drop"></p>`;

const SUBS = `
  <label class="fld"><span data-i18n="sub.edit"></span>
    <textarea id="assText" spellcheck="false" rows="10" autocapitalize="off" autocomplete="off"></textarea></label>
  <div class="row">
    <label class="fld grow"><span data-i18n="sub.pick"></span><input id="assFile" type="file" accept=".ass,.ssa,text/plain" /></label>
  </div>
  <p class="hint" id="subStatus" role="status"></p>
  <h3 class="sm" data-i18n="sub.presets"></h3>
  <div class="chips" id="presetList"></div>
  <p class="hint" id="presetHint"></p>`;

const FONTS = `
  <p class="hint" data-i18n="fonts.intro"></p>
  <div class="row">
    <label class="fld grow"><span data-i18n="fonts.pick"></span><input id="fontFiles" type="file" multiple accept=".ttf,.otf,.ttc,.otc,.woff,.woff2,.zip" /></label>
  </div>
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
  <p class="hint" data-i18n="fonts.how"></p>`;

const OPTIONS = `
  <div class="row">
    <label class="fld grow"><span data-i18n="opt.region"></span>
      <select id="region"><option value="video" data-i18n="opt.regionVideo"></option><option value="container" data-i18n="opt.regionContainer"></option><option value="custom" data-i18n="opt.regionCustom"></option></select></label>
    <label class="fld"><span data-i18n="opt.fit"></span>
      <select id="fit"><option>contain</option><option>cover</option><option>fill</option></select></label>
  </div>
  <div class="row" id="rectRow">${num('rx', 'opt.x', '120')}${num('ry', 'opt.y', '60')}${num('rw', 'opt.w', '720')}${num('rh', 'opt.h', '405')}</div>
  <div class="row">
    <label class="fld grow"><span data-i18n="opt.layout"></span>
      <select id="layout"><option value="script" data-i18n="opt.layoutScript"></option><option value="custom" data-i18n="opt.layoutCustom"></option></select></label>
    ${num('lw', 'opt.w', '1920', 'min="1"')}${num('lh', 'opt.h', '1080', 'min="1"')}
  </div>
  <div class="fld"><span data-i18n="opt.fps"></span>
    <div class="fpsrow">
      <label class="chk"><input id="fpsAuto" type="checkbox" checked /><span data-i18n="opt.auto"></span></label>
      <input id="fps" type="range" min="10" max="200" step="1" value="60" list="fpsMarks" data-i18n-attr="aria-label:opt.fps" />
      <output id="fpsOut">auto</output>
    </div>
    <div class="marks" id="fpsMarkBtns"></div>
    <datalist id="fpsMarks"></datalist>
  </div>
  <div class="row">
    ${num('videoFps', 'opt.videoFps', '', 'min="0" step="0.001" placeholder="off"')}
    ${num('offset', 'opt.offset', '0', 'step="0.1"')}
    ${num('zIndex', 'opt.zIndex', '1', 'step="1"')}
  </div>
  <p class="hint err" id="optErr" role="alert"></p>`;

const tab = (id: string, key: string, sel: boolean) =>
  `<button type="button" role="tab" id="tab-${id}" aria-controls="pn-${id}" aria-selected="${sel}" data-tab="${id}" data-i18n="${key}"></button>`;
const panel = (id: string, body: string, sel: boolean) =>
  `<div role="tabpanel" id="pn-${id}" aria-labelledby="tab-${id}" class="pane" ${sel ? '' : 'hidden'}>${body}</div>`;

export const PLAYGROUND_HTML = `
<h2 data-i18n="pg.title"></h2>
<p class="lead sm" data-i18n="pg.sub"></p>
<div class="pg" id="pg">
  <div class="pg-main">
    <div class="pg-view">
    <div class="stage" id="stage"><canvas id="card" aria-hidden="true"></canvas><video id="vid" playsinline hidden></video></div>
    <div class="transport">
      <button type="button" class="btn sm" id="play" data-i18n="ctl.pause"></button>
      <input id="seek" type="range" min="0" max="10" step="0.01" value="0" data-i18n-attr="aria-label:ctl.seek" />
      <output id="timeOut">0.00 s</output>
      <label class="fld inline"><span data-i18n="ctl.speed"></span>
        <select id="speed"><option>0.25</option><option>0.5</option><option selected>1</option><option>1.5</option><option>2</option></select></label>
    </div>
    </div>
    <dl class="metrics" id="metrics"></dl>
  </div>
  <div class="pg-side">
    <div role="tablist" class="tabs" data-i18n-attr="aria-label:pg.title">
      ${tab('source', 'tab.source', true)}${tab('subs', 'tab.subs', false)}${tab('fonts', 'tab.fonts', false)}${tab('opts', 'tab.opts', false)}${tab('matrix', 'tab.matrix', false)}${tab('code', 'tab.code', false)}
    </div>
    ${panel('source', SOURCE, true)}${panel('subs', SUBS, false)}${panel('fonts', FONTS, false)}${panel('opts', OPTIONS, false)}
    ${panel('matrix', '<p class="hint" data-i18n="mx.intro"></p><ul class="matrix" id="matrix"></ul>', false)}
    ${panel('code', '<p class="hint" data-i18n="code.intro"></p><pre class="code"><code id="snippet"></code></pre><button type="button" class="btn primary" id="copy" data-i18n="code.copy"></button>', false)}
  </div>
</div>`;
