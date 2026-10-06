/** Transport markup (seek row, step buttons, speed, loop) with ids `stSeek`, `stPlay`, ... */
const btn = (id: string, key: string, label: string, cls = 'btn sm') => `<button type="button" class="${cls}" id="${id}" data-i18n-attr="aria-label:${key},title:${key}">${label}</button>`;

const p = 'st';

export const transportMarkup = (): string => `
  <div class="st-seekrow">
    <output id="${p}Cur" class="mono">00:00.00</output>
    <input id="${p}Seek" type="range" min="0" max="1" step="0.001" value="0" data-i18n-attr="aria-label:st.seek" />
    <output id="${p}Total" class="mono">00:00.00</output>
  </div>
  <div class="st-btns" role="group" data-i18n-attr="aria-label:st.pl">
    ${btn(p + 'PrevLine', 'st.prevLine', '|&lt;')}${btn(p + 'Back5', 'st.back5', '-5s')}${btn(p + 'Back1', 'st.back1', '-1s')}${btn(p + 'BackF', 'st.backF', '-1f')}
    <button type="button" class="btn primary" id="${p}Play" data-i18n="st.play"></button>
    ${btn(p + 'FwdF', 'st.fwdF', '+1f')}${btn(p + 'Fwd1', 'st.fwd1', '+1s')}${btn(p + 'Fwd5', 'st.fwd5', '+5s')}${btn(p + 'NextLine', 'st.nextLine', '&gt;|')}
  </div>
  <div class="row st-opts">
    <label class="fld inline"><span data-i18n="st.speed"></span>
      <select id="${p}Speed"><option>0.25</option><option>0.5</option><option selected>1</option><option>2</option><option>4</option></select></label>
    <label class="chk"><input id="${p}Loop" type="checkbox" checked /><span data-i18n="st.loop"></span></label>
  </div>`;
