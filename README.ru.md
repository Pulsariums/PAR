<div align="center">

[English](README.md) · [Türkçe](README.tr.md) · **Русский**

<img src="assets/banner.svg" alt="PAR - Pulsar ASS Renderer: анимированная караоке-заливка поверх названия проекта" width="100%" />

<p>
  <a href="LICENSE"><img alt="Лицензия: MIT" src="https://img.shields.io/github/license/Pulsariums/PAR?color=5b3df5" /></a>
  <a href="https://github.com/Pulsariums/PAR/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Pulsariums/PAR/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/Pulsariums/PAR/actions/workflows/pages.yml"><img alt="Pages" src="https://github.com/Pulsariums/PAR/actions/workflows/pages.yml/badge.svg" /></a>
  <img alt="Версия" src="https://img.shields.io/github/package-json/v/Pulsariums/PAR?color=5b3df5" />
  <img alt="Размер: около 14 КБ в gzip" src="https://img.shields.io/badge/gzip-~14%20kB-5b3df5" />
  <img alt="Без зависимостей" src="https://img.shields.io/badge/dependencies-0-brightgreen" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-typed-3178c6?logo=typescript&logoColor=white" />
</p>

### [▶ Живая демо и песочница](https://pulsariums.github.io/PAR/)

**Рендерер субтитров ASS/SSA для браузера без зависимостей. DOM + SVG + CSS, без WebAssembly.**

</div>

PAR (Pulsar ASS Renderer) рисует субтитры Advanced SubStation Alpha (`.ass`) и SubStation Alpha (`.ssa`) поверх `<video>`
или любого контейнера. Достаточно передать элемент видео и исходный текст скрипта: размеры, поля letterbox, воспроизведение,
паузу и перемотку PAR отслеживает сам. Откройте [песочницу](https://pulsariums.github.io/PAR/), чтобы проверить каждый
поддерживаемый тег на встроенной тестовой таблице, на своём видеофайле или по ссылке, ничего не устанавливая.

## Возможности

| | |
|---|---|
| **Ноль зависимостей** | Около 14 КБ в gzip. Чистый TypeScript, никаких пакетов в рантайме и загрузки WASM. |
| **DOM, SVG и CSS** | Текст остаётся настоящим текстом, рисунки это SVG-контуры, буквы формирует собственный текстовый движок браузера. |
| **Подключил и работает** | `create({ video, subtitle })`. Letterbox, изменение размера, пауза и перемотка отслеживаются. |
| **Поведение как у libass** | Приоритет тегов, порядок `\t`, тайминг караоке и значения PlayRes по умолчанию повторяют libass. |
| **Детерминизм** | Одинаковый ввод, одинаковый результат. Идентификаторы строк берутся из порядка в файле, а не из случайных чисел. |
| **Частота кадров на ваш выбор** | Рисуйте на каждом кадре видео (`auto`) или ограничьте частоту от 10 до 200 fps; при желании привяжите время к fps видео. |
| **Область и разметка** | Видимая картинка видео, весь контейнер или любой прямоугольник; разрешение скрипта или любой виртуальный размер. |
| **Честные ограничения** | Каждый тег помечен: рисуется, приблизительно или не поддерживается (см. ниже). |

## Быстрый старт (30 секунд)

<details open>
<summary><b>ES-модуль / сборщик</b></summary>

```sh
npm install pulsar-ass-renderer
```

```js
import { create } from 'pulsar-ass-renderer';

const assText = await (await fetch('episode.ass')).text();
const par = create({ video: document.querySelector('video'), subtitle: assText });
```

> Пакета в npm пока нет. До выхода первого релиза соберите его из исходников (см. [Участие в проекте](CONTRIBUTING.md)).
</details>

<details>
<summary><b>Тег script (window.PAR)</b></summary>

```html
<script src="https://unpkg.com/pulsar-ass-renderer/dist/par.global.js"></script>
<script>
  const par = PAR.create({ video: document.querySelector('video'), subtitle: assText });
</script>
```
</details>

<details>
<summary><b>Без видео (контейнер и свои часы)</b></summary>

```js
const par = create({ container, subtitle: assText, clock: () => myPlayer.currentTime });

// или полностью вручную:
const still = create({ container, subtitle: assText });
still.renderAt(12.5); // секунды
```
</details>

Слой добавляется в родительский элемент видео (если у него `position: static`, он становится `relative`).

## Параметры

<details>
<summary><b>Все параметры</b></summary>

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `video` | `HTMLVideoElement` | - | Из него берутся время, пауза/перемотка и размер. |
| `container` | `HTMLElement` | `video.parentElement` | Элемент, в который добавляется слой; обязателен без видео. При `position: static` станет `relative` (`destroy()` вернёт как было). |
| `subtitle` | `string` | - | Исходный текст `.ass` / `.ssa`. |
| `region` | `'video' \| 'container' \| {x,y,width,height}` | с видео `'video'`, иначе `'container'` | Где размещаются субтитры. `'video'`: видимая картинка видео (с учётом letterbox и `object-fit`). Прямоугольник задаётся в пикселях контейнера. |
| `layout` | `'script' \| {width,height}` | `'script'` | Виртуальное пространство координат. `'script'` = PlayResX/PlayResY (с запасными значениями libass). Явный размер означает, что скрипт написан под него. |
| `fps` | `'auto' \| number` | `'auto'` | Частота отрисовки. `'auto'`: на каждый показанный кадр видео (`requestVideoFrameCallback`), иначе на каждый кадр экрана. Число от 10 до 200 задаёт потолок (выше частоты обновления экрана не поднимется). |
| `videoFps` | `number \| null` | `null` | Частота кадров исходного видео. Если задана, время привязывается к началу кадра. От `fps` не зависит. |
| `clock` | `() => number` | `video.currentTime` | Собственные часы в секундах. |
| `timeOffset` | `number` | `0` | Секунды, добавляемые к часам (задержка субтитров). |
| `fontMap` | `Record<string,string>` | `{}` | Имя шрифта ASS -> CSS `font-family`. Шрифты вы подключаете сами через `@font-face`. |
| `zIndex` | `number` | `1` | z-index слоя. |

Недопустимые значения вызывают исключение (`fps: 5` даёт `RangeError`, область нулевого размера даёт `TypeError`).
</details>

## API

<details>
<summary><b>Справочник</b></summary>

| Член | Описание |
|---|---|
| `create(options)` / `new PARRenderer(options)` | Создаёт рендерер и добавляет его слой. |
| `setSubtitle(text \| null)` | Загружает или очищает субтитры. На повреждённом скрипте не бросает исключений (смотрите `script.warnings`). |
| `setOptions(patch)` | Меняет параметры на лету; меняются только переданные ключи. Смена `video`/`container` пересоздаёт слой. |
| `renderAt(seconds)` | Сразу рисует момент `seconds` (учитываются `timeOffset` и `videoFps`). |
| `refresh()` | Заново измеряет область и перерисовывает текущий момент. |
| `getMetrics()` | `{ region, layout, scaleX, scaleY, time, activeLines, running }`. |
| `script` | Разобранный скрипт (`ParsedScript`) или `null`. Только для чтения. |
| `element` | Корневой элемент слоя. |
| `destroy()` | Удаляет слой, обработчики, наблюдатели и цикл. Дальнейшие вызовы бросают исключение. |

Также экспортируются чистые функции без DOM: `parseScript`, `parseText`, `parseBlock`, `parseTransition`, `lexOverrides`,
`parseDrawing`, `resolvePlayRes`, `fitRect`, `resolveRegion`, `resolveLayoutSize`, `stageTransform`, `VERSION` и все типы.

**Жизненный цикл.** С видео цикл работает только во время воспроизведения; пауза, перемотка, метаданные и смена размера дают один кадр.
С собственными часами и без видео цикл идёт постоянно (если время не изменилось, работы он не делает). Если нет ни того ни другого,
ничего не происходит, пока вы не вызовете `renderAt()`. Слой использует `pointer-events: none`, поэтому элементы управления видео работают.
</details>

## Поддерживаемые теги

Статусы совпадают с таблицей проверки возможностей в песочнице: каждая её строка загружает пример, который можно проверить глазами.
**Рисуется**: тег отрисовывается в DOM. **Приблизительно**: отрисовывается, но известным образом отличается от libass. **Не поддерживается**: не рисуется.

<details open>
<summary><b>Таблица поддержки тегов</b></summary>

| Тег / возможность | Статус | Примечания |
|---|---|---|
| `\pos` `\move(x1,y1,x2,y2[,t1,t2])` | Рисуется | Действует первый `\pos`/`\move` строки (как в libass). |
| `\an` `\a` | Рисуется | Действует первый; устаревший `\a` преобразуется. |
| `\org` `\frx` `\fry` `\frz` `\fr` | Рисуется | 3D с фиксированной перспективой; `\org` по умолчанию равен точке привязки. |
| `\fad` `\fade` | Рисуется | Прозрачность строки, действует первый. |
| `\clip` `\iclip` (прямоугольник) | Рисуется | CSS `clip-path`; действует последний; анимируется через `\t`. |
| `\clip` `\iclip` (вектор, с масштабом) | Рисуется | Не анимируется (как в libass). |
| `\t([t1,t2,][accel,]теги)` | Рисуется | Несколько тегов, необязательные времена, ускорение, вычисление в порядке записи. |
| `\k` `\K` `\kf` `\ko` `\kt` | Рисуется | Смена цвета, заливка, появление контура. |
| `\r` `\r<стиль>` | Рисуется | Неизвестный стиль заменяется стилем строки. |
| `\fn` `\fs` (`\fs+n`/`\fs-n`) `\fscx` `\fscy` `\fsp` | Рисуется | Шрифт через `fontMap` или по самому имени. |
| `\fax` `\fay` | Рисуется | Опорная точка слева сверху у текста. Различия между фрагментами берутся по значению первого фрагмента. |
| `\b` `\i` `\u` `\s` | Рисуется | |
| `\bord` `\shad` `\xshad` `\yshad` | Рисуется | Контур и тень средствами CSS. |
| `\xbord` `\ybord` | Приблизительно | При разных x и y берётся большее значение. |
| `\blur` `\be` | Приблизительно | CSS `blur()` на весь фрагмент (заливка и контур вместе). |
| `\c` `\1c`..`\4c` `\alpha` `\1a`..`\4a` | Рисуется | |
| `\p<n>` рисунки (`m n l b s p c`), `\pbo` | Рисуется | SVG-контур; замыкание сплайна (`c`) заменено прямой. |
| `\q1` `\q2` | Рисуется | Обычный перенос / без переноса. |
| `\q0` `\q3`, `WrapStyle` 0 и 3 | Приблизительно | Используется CSS `text-wrap: balance`. |
| `\N` `\n` `\h` | Рисуется | |
| BorderStyle 1 и 3 | Рисуется | Контур и тень / сплошная плашка. |
| Слои, раскладка при пересечении, комментарии | Рисуется | Строки без позиции укладываются стопкой и не сдвигаются; `Comment:` пропускается. |
| `\fe` | Не поддерживается | Разбирается и игнорируется (для веб-шрифтов смысла нет). |
| Поле `Effect` события (`Banner;`, `Scroll up;`, `Scroll down;`) | Не поддерживается | |
| Заливка `\kf` на рисунках | Не поддерживается | Рисунок меняет цвет только в конце. |
| `[Fonts]` / `[Graphics]`, BorderStyle 4, поправка LayoutResX/Y | Не поддерживается | `LayoutResX/Y` разбирается, но не используется. |
</details>

<details>
<summary><b>Известные ограничения</b></summary>

- **Метрики глифов.** Текст формирует и растеризует браузер; `\fs` переводится в CSS с фиксированным коэффициентом (0,9), поэтому ширина, высота строк и хинтинг немного отличаются от libass.
- Фрагмент, чей поворот отличается от первого фрагмента строки, вращается вокруг собственного центра; фрагмент с другим соотношением `\fscx`/`\fscy` становится inline-block (внутри него нет переноса строк); слог с `\kf` не переносится на другую строку.
- Скрипт с другим соотношением сторон PlayRes растягивается на видео (как в VSFilter).
- Если `ScaledBorderAndShadow` не указан, берётся `yes` (как в libass); VSFilter считает его равным `no`.
- В headless Chromium на Linux мы видели положительный `\fax` без наклона глифов (отрицательные значения рисуются верно). Похоже на проблему растеризатора, а не преобразования в PAR.
</details>

## Чем PAR отличается от других решений

<details>
<summary><b>PAR и libass-wasm, JASSUB, SubtitlesOctopus</b></summary>

libass-wasm, JASSUB и SubtitlesOctopus компилируют эталонную C-библиотеку **libass** в WebAssembly и рисуют на canvas.
PAR выбирает другой компромисс: libass он не включает, а рисует средствами браузера.

| | PAR | libass-wasm / JASSUB / SubtitlesOctopus |
|---|---|---|
| Подход | DOM, SVG и CSS | libass, скомпилированный в WebAssembly |
| WASM-файл для поставки | Нет | Да (и скрипт воркера) |
| Размер | Около 14 КБ в gzip, ноль зависимостей | Больше: внутри скомпилированная библиотека |
| Фреймворк | Не нужен, чистый TypeScript | Обычный JS, у каждого своя настройка |
| Результат | Настоящие узлы DOM и SVG | Пиксели на canvas |
| Вывод глиф в глиф как у libass | Нет (приближения перечислены выше) | Да, ради этого libass и берут |
| Встроенные шрифты | Не поддерживаются | Поддерживаются рендерерами на libass |

Если важнее всего точность до пикселя и полное покрытие тегов, выбирайте рендерер на libass. Если достаточно небольшого,
не требующего WASM рендерера на DOM, который удобно инспектировать, выбирайте PAR. Актуальные подробности смотрите в документации каждого проекта.
</details>

## Поддержка браузеров

Современные браузеры: Chrome/Edge 88+, Firefox 97+, Safari 13.1+ (CSS `clip-path: path()`, `ResizeObserver`). Необязательные возможности
при отсутствии заменяются без ошибок: `requestVideoFrameCallback` (иначе rAF), `paint-order` для HTML-текста (Chrome 123+, Firefox, Safari;
без него контур заходит и на внутреннюю половину края глифа), `text-wrap: balance` (иначе жадный перенос).

## Вопросы и ответы

<details>
<summary>Результат совпадает с libass?</summary>

Нет. PAR следует правилам libass в приоритете тегов и таймингах, но глифы рисует браузер, поэтому метрики немного отличаются. Смотрите таблицу статусов.
</details>

<details>
<summary>Работает ли это с HLS, DASH и другими потоковыми плеерами?</summary>

PAR берёт время из обычного элемента `<video>` (или из вашей функции `clock`), так что подойдёт всё, что играет в `<video>`. Если плеер без `<video>`, передайте `container` и `clock`.
</details>

<details>
<summary>Как использовать с React, Vue или Svelte?</summary>

Создавайте рендерер после появления элемента (effect / `onMount`) и вызывайте `par.destroy()` при очистке. Кода под конкретные фреймворки в PAR нет, а дерево ваших компонентов он не трогает, кроме собственного элемента слоя.
</details>

<details>
<summary>Как поправить тайминг субтитров?</summary>

Используйте `timeOffset` (секунды; положительное значение задерживает субтитры), а для привязки к кадрам задайте `videoFps`.
</details>

<details>
<summary>В полноэкранном режиме субтитров нет. Почему?</summary>

В полноэкранном режиме показывается только поддерево полноэкранного элемента. Запрашивайте полный экран у контейнера, в котором лежат и видео, и слой PAR, а не у одного `<video>`.
</details>

<details>
<summary>Почему нет встроенных шрифтов?</summary>

Пока не реализовано. Подключайте шрифты через `@font-face`, а имена шрифтов ASS сопоставляйте через `fontMap`.
</details>

## Участие в проекте

Issues и pull request приветствуются. Установку, проверки и заметки для мейнтейнеров (включая разовый шаг
**Settings → Pages → Source: GitHub Actions**) смотрите в [CONTRIBUTING.md](CONTRIBUTING.md). О проблемах безопасности сообщайте так, как описано в [SECURITY.md](SECURITY.md).

## Для мейнтейнеров: GitHub Pages

Сайт из `site/` выкладывается workflow `.github/workflows/pages.yml` при каждом push в `main`. Разовая настройка: **Settings → Pages →
Build and deployment → Source: GitHub Actions**. Подробности в [CONTRIBUTING.md](CONTRIBUTING.md).

## Лицензия

MIT, (c) Pulsariums. См. [LICENSE](LICENSE).
