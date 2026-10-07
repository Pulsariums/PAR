const icon = (d: string): string => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
export const ICON = {
  play: icon('M8 5v14l11-7z'),
  pause: icon('M6 5h4v14H6zm8 0h4v14h-4z'),
  full: icon('M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 0h2v5h-5v-2h3z'),
  exit: icon('M8 5h2v5H5V8h3zm6 0h2v3h3v2h-5zM5 14h5v5H8v-3H5zm9 0h5v2h-3v3h-2z'),
  mute: icon('M4 9v6h4l5 4V5L8 9zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z'),
  muted: icon('M4 9v6h4l5 4V5L8 9zm11.3.3 1.4-1.4 2.3 2.3 2.3-2.3 1.4 1.4-2.3 2.3 2.3 2.3-1.4 1.4-2.3-2.3-2.3 2.3-1.4-1.4 2.3-2.3z'),
  cc: icon('M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm3 5v4h2v-1h2v1h0a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2zm7 0v4h2v-1h2v1h0a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2z'),
};

const pick = (id: string, key: string): string => `<button type="button" class="btn" id="${id}" data-i18n="${key}"></button>`;

/** The player page: stage (video + subtitles + controls), then one row per kind of file. Ids use the `w` prefix. */
export const WATCH_HTML = `
<div class="w" id="w">
  <div class="w-stage" id="wStage" tabindex="0" role="application" data-i18n-attr="aria-label:w.stage">
    <video id="wVid" playsinline preload="auto"></video>
    <div class="w-empty" id="wEmpty">
      <p class="w-empty-t" data-i18n="w.drop"></p>
      <div class="w-empty-b">${pick('wPickVideo0', 'w.video')}${pick('wPickSub0', 'w.sub')}${pick('wPickFonts0', 'w.fonts')}</div>
    </div>
    <div class="w-state" id="wState" role="status" aria-live="polite" hidden></div>
    <div class="w-bar" id="wBar">
      <input class="w-seek" id="wSeek" type="range" min="0" max="1" step="0.001" value="0" data-i18n-attr="aria-label:w.seek" />
      <div class="w-btns">
        <button type="button" class="w-ib" id="wPlay" data-i18n-attr="aria-label:w.play">${ICON.play}</button>
        <output class="w-time mono" id="wTime">00:00 / 00:00</output>
        <span class="w-grow"></span>
        <button type="button" class="w-ib" id="wMute" data-i18n-attr="aria-label:w.mute">${ICON.mute}</button>
        <input class="w-vol" id="wVol" type="range" min="0" max="1" step="0.05" value="1" data-i18n-attr="aria-label:w.volume" />
        <select class="w-speed" id="wSpeed" data-i18n-attr="aria-label:w.speed"><option>0.5</option><option>0.75</option><option selected>1</option><option>1.25</option><option>1.5</option><option>2</option></select>
        <button type="button" class="w-ib" id="wCc" aria-pressed="true" data-i18n-attr="aria-label:w.cc">${ICON.cc}</button>
        <button type="button" class="w-ib" id="wFull" data-i18n-attr="aria-label:w.full">${ICON.full}</button>
      </div>
    </div>
  </div>
  <div class="w-files">
    <div class="w-file"><span class="w-k" data-i18n="w.video"></span><span class="w-n" id="wVideoName"></span>${pick('wPickVideo', 'w.change')}</div>
    <div class="w-file"><span class="w-k" data-i18n="w.sub"></span><span class="w-n" id="wSubName"></span>${pick('wPickSub', 'w.change')}</div>
    <div class="w-file"><span class="w-k" data-i18n="w.fonts"></span><span class="w-n" id="wFontsName"></span>${pick('wPickFonts', 'w.add')}</div>
  </div>
  <p class="hint" id="wStatus" role="status" aria-live="polite"></p>
  <div id="wFontPrompt" class="fontprompt"></div>
  <p class="hint" data-i18n="w.privacy"></p>
  <input type="file" id="wFileVideo" accept="video/*,.mkv,.mp4,.webm,.mov,.m4v,.ogv" hidden />
  <input type="file" id="wFileSub" accept=".ass,.ssa,.xpar,.par,.txt" hidden />
  <input type="file" id="wFileFonts" accept=".ttf,.otf,.ttc,.otc,.woff,.woff2,.zip" multiple hidden />
</div>`;
