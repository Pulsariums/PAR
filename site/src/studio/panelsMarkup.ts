/** The two collapsible panels under the player: metrics and virtual-vs-real layout (texts from data-i18n keys, rows filled by stats.ts / layoutPanel.ts). */

export const METRICS_HTML = `
<details class="st-fold" id="stMetrics">
  <summary><span data-i18n="st.metrics"></span> <span class="mono st-sum" id="stMetricsSum"></span></summary>
  <dl class="metrics" id="stStats"></dl>
</details>`;

export const LAYOUT_HTML = `
<details class="st-fold" id="stLayout">
  <summary><span data-i18n="st.lay"></span> <span class="mono st-sum" id="stLaySum"></span></summary>
  <dl class="st-kv" id="stLayKv"></dl>
  <div class="fld"><span data-i18n="st.l.default"></span>
    <div class="seg block" role="group" id="stLayDef" data-i18n-attr="aria-label:st.l.default">
      <button type="button" data-def="1080p" aria-pressed="true" data-i18n="st.l.d1080"></button>
      <button type="button" data-def="720p" aria-pressed="false" data-i18n="st.l.d720"></button>
      <button type="button" data-def="libass" aria-pressed="false" data-i18n="st.l.dlibass"></button>
      <button type="button" data-def="custom" aria-pressed="false" data-i18n="st.l.dcustom"></button>
    </div>
    <div class="row" id="stLayDefRow" hidden>
      <label class="fld"><span data-i18n="st.l.w"></span><input id="stLayDefW" type="number" min="1" value="1920" inputmode="numeric" /></label>
      <label class="fld"><span data-i18n="st.l.h"></span><input id="stLayDefH" type="number" min="1" value="1080" inputmode="numeric" /></label>
    </div>
  </div>
  <div class="fld"><span data-i18n="st.l.override"></span>
    <div class="seg block" role="group" id="stLayOv" data-i18n-attr="aria-label:st.l.override">
      <button type="button" data-ov="off" aria-pressed="true" data-i18n="st.l.oOff"></button>
      <button type="button" data-ov="custom" aria-pressed="false" data-i18n="st.l.oCustom"></button>
    </div>
    <div class="row" id="stLayOvRow" hidden>
      <label class="fld"><span data-i18n="st.l.w"></span><input id="stLayOvW" type="number" min="1" value="1920" inputmode="numeric" /></label>
      <label class="fld"><span data-i18n="st.l.h"></span><input id="stLayOvH" type="number" min="1" value="1080" inputmode="numeric" /></label>
    </div>
  </div>
  <label class="chk"><input id="stLayOverlay" type="checkbox" /><span data-i18n="st.l.overlay"></span></label>
  <p class="hint" data-i18n="st.l.explain"></p>
</details>`;
