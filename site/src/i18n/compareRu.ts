export const compareRu = {
  'nav.compare': 'Сравнение',
  'cmp.title': 'PAR vs JASSUB vs libass',
  'cmp.lead': 'Сравнение нативного TypeScript-движка для браузера с портами WebAssembly и десктопным эталоном.',
  'cmp.th.dimension': 'Параметр',
  'cmp.th.par': 'PAR',
  'cmp.th.jassub': 'JASSUB',
  'cmp.th.libass': 'libass',
  'cmp.th.par_badge': 'Чистый Web',
  'cmp.th.jassub_badge': 'WASM-порт',
  'cmp.th.libass_badge': 'Десктопный эталон',

  'cmp.row.arch': 'Архитектура / Среда',
  'cmp.par.arch': 'Чистый TypeScript / ESM (DOM, SVG и воркер Canvas2D)',
  'cmp.jassub.arch': 'WebAssembly + Canvas (C-код libass через Emscripten)',
  'cmp.libass.arch': 'Нативный C / C++ (Десктоп: mpv, VLC, Aegisub)',

  'cmp.row.size': 'Размер бандла / Загрузка',
  'cmp.par.size': '~35 КБ в gzip (Ноль зависимостей)',
  'cmp.jassub.size': '~2.5–5 МБ (WASM-бинарник + HarfBuzz + FreeType)',
  'cmp.libass.size': 'Н/Д (Встроенная системная библиотека)',

  'cmp.row.startup': 'Время запуска',
  'cmp.par.startup': '<10 мс мгновенно (Без компиляции, первый кадр сразу)',
  'cmp.jassub.startup': '300–800 мс (Загрузка по сети и компиляция WASM)',
  'cmp.libass.startup': '<5 мс (Нативный десктопный запуск)',

  'cmp.row.render': 'Отрисовка и масштабирование',
  'cmp.par.render': 'Чёткий HiDPI/Retina SVG и Canvas (Идеальная резкость)',
  'cmp.jassub.render': 'Фиксированный растровый Canvas (Пиксели размываются)',
  'cmp.libass.render': 'Прямой растр (Нативный рендеринг глифов)',

  'cmp.row.a11y': 'Выделение текста и доступность',
  'cmp.par.a11y': 'Да (В DOM: скринридеры, копирование, поиск)',
  'cmp.jassub.a11y': 'Нет (Непрозрачные пиксели на холсте)',
  'cmp.libass.a11y': 'Нет (Пиксельный оверлей поверх видео)',

  'cmp.row.memory': 'Память и мобильные устройства',
  'cmp.par.memory': 'Низкий heap, экономия батареи (Сборщик мусора браузера)',
  'cmp.jassub.memory': 'Тяжёлый heap WASM (64+ МБ линейной памяти)',
  'cmp.libass.memory': 'Н/Д (Управление памятью ОС)',

  'cmp.row.parity': 'Совместимость с поведением ASS',
  'cmp.par.parity': 'Высокая совместимость с веб-движком (Диалоги + Воркер)',
  'cmp.jassub.parity': '100% совместимость с C (Выполнение оригинального libass)',
  'cmp.libass.parity': 'Эталонная реализация (Де-факто стандарт ASS)',

  'cmp.card.frametimes.title': 'Фреймтайм и плавность без просадок',
  'cmp.card.frametimes.desc': 'Для видео в вебе критически важен ровный бюджет кадра 16.6 мс (60 fps). Передача многомегабайтных буферов между WebAssembly-воркерами и основным потоком вызывает микрофризы. PAR отображает диалоги через CSS-трансформации браузера, а тяжелую графику отдает воркеру, удерживая стабильный fps.',

  'cmp.card.wasm.title': 'Скрытая цена WebAssembly',
  'cmp.card.wasm.desc': 'JASSUB упаковывает libass, HarfBuzz и FreeType в 2.5–5 МБ бинарного кода WebAssembly. На мобильных устройствах это приводит к задержке старта при скачивании и компиляции, а также резервирует 64+ МБ линейной памяти, расходуя заряд аккумулятора.',

  'cmp.card.dualpath.title': 'Двухпутевая веб-архитектура PAR'
,
  'cmp.card.dualpath.desc': 'Спроектировано специально для браузера: обычные реплики рисуются через нативный DOM/SVG с субпиксельным сглаживанием и доступностью текста. Сложные рисунки, маски и анимации направляются в фоновый пул воркеров Canvas2D. Вы получаете мгновенный старт, резкий текст и ноль зависимостей.',
};
