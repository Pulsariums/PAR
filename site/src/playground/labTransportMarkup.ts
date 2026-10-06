/** Transport markup (seek row, step buttons, speed, loop) with ids `<p>Seek`, `<p>Play`, ...; the Lab uses `lab`, the Studio `st`. Texts reuse the `lab.*` keys. */
const btn = (id: string, key: string, label: string, cls = 'btn sm') => `<button type="button" class="${cls}" id="${id}" data-i18n-attr="aria-label:${key},title:${key}">${label}</button>`;

export const transportMarkup = (p: string, extraOpts = ''): string => `
  <div class="lab-seekrow">
    <output id="${p}Cur" class="mono">00:00.00</output>
    <input id="${p}Seek" type="range" min="0" max="1" step="0.001" value="0" data-i18n-attr="aria-label:lab.seek" />
    <output id="${p}Total" class="mono">00:00.00</output>
  </div>
  <div class="lab-btns" role="group" data-i18n-attr="aria-label:lab.pl">
    ${btn(p + 'PrevLine', 'lab.prevLine', '|&lt;')}${btn(p + 'Back5', 'lab.back5', '-5s')}${btn(p + 'Back1', 'lab.back1', '-1s')}${btn(p + 'BackF', 'lab.backF', '-1f')}
    <button type="button" class="btn primary" id="${p}Play" data-i18n="lab.play"></button>
    ${btn(p + 'FwdF', 'lab.fwdF', '+1f')}${btn(p + 'Fwd1', 'lab.fwd1', '+1s')}${btn(p + 'Fwd5', 'lab.fwd5', '+5s')}${btn(p + 'NextLine', 'lab.nextLine', '&gt;|')}
  </div>
  <div class="row lab-opts">
    <label class="fld inline"><span data-i18n="lab.speed"></span>
      <select id="${p}Speed"><option>0.25</option><option>0.5</option><option selected>1</option><option>2</option><option>4</option></select></label>
    <label class="chk"><input id="${p}Loop" type="checkbox" checked /><span data-i18n="lab.loop"></span></label>
    ${extraOpts}
  </div>`;
