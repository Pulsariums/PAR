<div align="center">

[English](README.md) · **Türkçe** · [Русский](README.ru.md)

<img src="assets/banner.svg" alt="PAR - Pulsar ASS Renderer: proje adının üzerinde animasyonlu karaoke dolgusu" width="100%" />

<p>
  <a href="LICENSE"><img alt="Lisans: MIT" src="https://img.shields.io/github/license/Pulsariums/PAR?color=5b3df5" /></a>
  <a href="https://github.com/Pulsariums/PAR/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Pulsariums/PAR/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/Pulsariums/PAR/actions/workflows/pages.yml"><img alt="Pages" src="https://github.com/Pulsariums/PAR/actions/workflows/pages.yml/badge.svg" /></a>
  <img alt="Sürüm" src="https://img.shields.io/github/package-json/v/Pulsariums/PAR?color=5b3df5" />
  <img alt="Boyut: gzip ile yaklaşık 30 kB" src="https://img.shields.io/badge/gzip-~30%20kB-5b3df5" />
  <img alt="Sıfır bağımlılık" src="https://img.shields.io/badge/dependencies-0-brightgreen" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-typed-3178c6?logo=typescript&logoColor=white" />
</p>

### [▶ Canlı demo ve deneme alanı](https://pulsariums.github.io/PAR/)

**Tarayıcı için bağımlılıksız ASS/SSA altyazı çizicisi. DOM + SVG + CSS, WebAssembly yok.**

</div>

PAR (Pulsar ASS Renderer), Advanced SubStation Alpha (`.ass`) ve SubStation Alpha (`.ssa`) altyazılarını bir `<video>` ya da
herhangi bir konteynerin üzerine çizer. Video elemanını ve ham betik metnini vermeniz yeterli; boyutlandırma, letterbox,
oynat, duraklat ve sarma takibi kendiliğinden yapılır. Hiçbir şey kurmadan, hazır test deseniyle, kendi video dosyanızla ya da
bir video adresiyle her etiketi denemek için [deneme alanını](https://pulsariums.github.io/PAR/) açın.

## Özellikler

| | |
|---|---|
| **Sıfır bağımlılık** | Gzip ile yaklaşık 30 kB. Saf TypeScript; çalışma zamanında paket ya da WASM indirmesi yok. |
| **DOM, SVG ve CSS** | Metin gerçek metin olarak kalır, çizimler SVG yoludur, harfleri tarayıcının kendi yazı motoru şekillendirir. |
| **Tak ve çalıştır** | `create({ video, subtitle })`. Letterbox, yeniden boyutlandırma, oynat, duraklat ve sarma izlenir. |
| **libass kurallarına yakın** | Etiket önceliği, `\t` sırası, karaoke zamanlaması ve PlayRes yedekleri libass'teki gibidir (tek istisna: hiç PlayRes'i olmayan betikler varsayılan olarak 1280x720 olur; `defaultLayout: 'libass'` 384x288 verir). |
| **Deterministik** | Aynı girdi, aynı çıktı. Satır kimlikleri dosya sırasından gelir, rastgelelikten değil. |
| **Kare hızı sizde** | Her video karesinde çizin (`auto`) ya da 10 ile 200 fps arasında sınırlayın; isterseniz zamanı video kare hızına yuvarlayın. |
| **Bölge ve yerleşim** | Görünen video resmi, tüm konteyner ya da herhangi bir dikdörtgen; betik çözünürlüğü ya da istediğiniz sanal boyut. |
| **Dürüst sınırlar** | Her etiket çizilen, yaklaşık ya da desteklenmeyen olarak listelenir (aşağıya bakın). |

## Hızlı başlangıç (30 saniye)

<details open>
<summary><b>ES modülü / paketleyici</b></summary>

```sh
npm install pulsar-ass-renderer
```

```js
import { create } from 'pulsar-ass-renderer';

const assText = await (await fetch('episode.ass')).text();
const par = create({ video: document.querySelector('video'), subtitle: assText });
```

> Paket henüz npm'de değil. İlk sürüm yayımlanana kadar kaynaktan derleyin ([Katkı](CONTRIBUTING.md) sayfasına bakın).
</details>

<details>
<summary><b>Script etiketi (window.PAR)</b></summary>

```html
<script src="https://unpkg.com/pulsar-ass-renderer/dist/par.global.js"></script>
<script>
  const par = PAR.create({ video: document.querySelector('video'), subtitle: assText });
</script>
```
</details>

<details>
<summary><b>Video olmadan (konteyner + kendi saatiniz)</b></summary>

```js
const par = create({ container, subtitle: assText, clock: () => myPlayer.currentTime });

// ya da tamamen elle:
const still = create({ container, subtitle: assText });
still.renderAt(12.5); // saniye
```
</details>

Katman, videonun ebeveyn elemanına eklenir (eleman `position: static` ise `relative` yapılır).

## Seçenekler

<details>
<summary><b>Tüm seçenekler</b></summary>

| Seçenek | Tür | Varsayılan | Açıklama |
|---|---|---|---|
| `video` | `HTMLVideoElement` | - | Zaman, oynat/duraklat/sar ve boyut bu elemandan izlenir. |
| `container` | `HTMLElement` | `video.parentElement` | Katmanın eklendiği eleman; video yoksa zorunludur. `position: static` ise `relative` yapılır (`destroy()` geri alır). |
| `subtitle` | `string \| SubtitleSource` | - | Ham `.ass` / `.ssa` metni ya da büyük dosyalar için bir `SubtitleSource` (bkz. [Büyük dosyalar](#büyük-dosyalar-pencereli-kaynaklar)). |
| `region` | `'video' \| 'container' \| {x,y,width,height}` | videoyla `'video'`, yoksa `'container'` | Altyazının yeri. `'video'`: videonun görünen resmi (letterbox'a duyarlı, `object-fit` dikkate alınır). Dikdörtgen: konteyner pikseli. |
| `layout` | `'script' \| {width,height}` | `'script'` | Sanal koordinat uzayı. `'script'` = betiğin PlayRes değeri (bkz. [Varsayılan yerleşim boyutu](#varsayılan-yerleşim-boyutu-sanal-ve-gerçek)). Boyut verilirse betik o boyuta göre yazılmış sayılır ve her şeyden önce gelir. |
| `defaultLayout` | `'720p' \| 'libass' \| {width,height}` | `'720p'` | PlayRes'i hiç olmayan betikler için sanal boyut: 1280x720, libass'in 384x288'i ya da kendi boyutunuz. |
| `windowSeconds` | `number` | `12` | `SubtitleSource` ile: bellekte tutulan olay süresi, sn (yaklaşık 1/6'sı oynatma konumunun gerisi, kalanı ilerisi). |
| `fps` | `'auto' \| number` | `'auto'` | Çizim hızı. `'auto'`: her video karesinde (`requestVideoFrameCallback`), yoksa her ekran karesinde. Sayı: 10..200 üst sınır (ekran tazeleme hızını aşamaz). |
| `videoFps` | `number \| null` | `null` | Kaynak videonun kare hızı. Verilirse zaman kare başına yuvarlanır. `fps`'ten bağımsızdır. |
| `clock` | `() => number` | `video.currentTime` | Özel saat (saniye). |
| `timeOffset` | `number` | `0` | Saate eklenen saniye (altyazı gecikmesi). |
| `fontMap` | `Record<string,string>` | `{}` | ASS yazı tipi adı -> CSS `font-family`. Yazı tiplerini `@font-face` ile siz yüklersiniz. |
| `fonts` | `FontSpec[]` | `[]` | Oluşturulurken yüklenecek fontlar (File, Blob, bayt, URL ya da `{ source, family }`). Bkz. [Fontlar](#fontlar). |
| `useLocalFonts` | `boolean` | `false` | Yüklü fontları Local Font Access API ile kullanır (Chromium, izin ister). Hiçbir zaman zorunlu değildir. |
| `embeddedFonts` | `boolean` | `true` | Betiğin `[Fonts]` bölümünü yükler. |
| `fontProviders` | `FontProvider[]` | `[]` | Eşzamansız font kaynakları (font kütüphanesi, URL tablosu, kendinizinki); önceki hiçbir şeyin karşılamadığı aileler için sırayla sorulur. Bkz. [Fontlar](#fontlar). |
| `providerTimeout` | `number` | `5000` | Sağlayıcı çağrısı başına ms. Susan sağlayıcı "bulunamadı" sayılır. |
| `onMissingFonts` | `(report, ctrl) => 'continue' \| 'wait' \| Promise` | yok | Font eksikse ne olacağına karar verir. Varsayılan: yedek fontla devam. |
| `zIndex` | `number` | `1` | Katmanın z-index değeri. |

Geçersiz değerler hata fırlatır (`fps: 5` -> `RangeError`, sıfır boyutlu bölge -> `TypeError`).
</details>

## API

<details>
<summary><b>Başvuru</b></summary>

| Üye | Açıklama |
|---|---|
| `create(options)` / `new PARRenderer(options)` | Çizici oluşturur ve katmanını ekler. |
| `setSubtitle(text \| SubtitleSource \| null)` | Altyazıyı yükler ya da temizler. Bozuk betikte hata fırlatmaz (`script.warnings`'e bakın). |
| `setOptions(patch)` | Seçenekleri çalışırken değiştirir; yalnız verilen anahtarlar değişir. `video`/`container` değişirse yeniden bağlanır. |
| `renderAt(seconds)` | `seconds` anını hemen çizer (`timeOffset` ve `videoFps` uygulanır). |
| `refresh()` | Bölgeyi yeniden ölçer ve geçerli anı yeniden çizer. |
| `getMetrics()` | `{ region, layout, scaleX, scaleY, layoutSize, regionSize, scale, layoutSource, layoutDerived, time, activeLines, running }`: sanal boyut, gerçek boyut, oranları ve sanal boyutun nereden geldiği. |
| `getSourceStats()` | Yüklü `SubtitleSource` için `{ windowEvents, windowRange, loading, bytesRead, decodeMs, indexMs }` (bellekteki olaylar, yüklü aralık, okunan bayt, çözme süresi). |
| `script` | Ayrıştırılmış betik (`ParsedScript`) ya da `null`. Salt okunur. |
| `element` | Katman kök elemanı. |
| `destroy()` | Katmanı, dinleyicileri, gözlemcileri ve döngüyü kaldırır. Sonraki çağrılar hata fırlatır. |

Saf (DOM'suz) yardımcılar da dışa aktarılır: `parseScript`, `parseText`, `parseBlock`, `parseTransition`, `lexOverrides`,
`parseDrawing`, `resolvePlayRes`, `fitRect`, `resolveRegion`, `resolveLayoutSize`, `stageTransform`, `VERSION` ve tüm türler.

**Yaşam döngüsü.** Video ile kullanımda döngü yalnız video oynarken çalışır; duraklatma, sarma, metadata ve boyut değişiminde tek kare çizilir.
Özel saat varsa ve video yoksa döngü sürekli çalışır (zaman değişmediyse iş yapmaz). İkisi de yoksa `renderAt()` çağırana kadar hiçbir şey çalışmaz.
Katman `pointer-events: none` kullanır, video kontrollerini engellemez.
</details>

## Varsayılan yerleşim boyutu (sanal ve gerçek)

Her zaman iki boyut vardır. **Sanal** (yerleşim) boyut, betiğin yerleştirildiği koordinat uzayıdır: `\pos`, kenar boşlukları, yazı boyutları ve çizgi kalınlıkları bu uzaydaki sayılardır. **Gerçek** boyut, sonucun çizildiği ekran bölgesidir (CSS piksel). PAR sanal çerçeveyi gerçek bölgeye ölçekler (`ölçek = gerçek / sanal`, eksen eksen).

Sanal boyutun seçilme sırası:

| Adım | Kaynak | `getMetrics().layoutSource` |
|---|---|---|
| 1 | `layout: { width, height }` seçeneği | `'option'` |
| 2 | betiğin `PlayResX` **ve** `PlayResY` değerleri | `'script'` |
| 3 | yalnız biri var: diğer kenar, gösterilen bölgenin en-boy oranından türetilir (kullanılabilir bölge yoksa 16:9); `defaultLayout: 'libass'` ile bunun yerine libass kuralı uygulanır (yalnız X: Y = X x 3/4, 1280 için 1024; yalnız Y: X = Y x 4/3, 1024 için 1280) | `'script'`, `layoutDerived: true` |
| 4 | ikisi de yok | `defaultLayout`: `'720p'` (varsayılan, 1280x720), `'libass'` (384x288) ya da `{ width, height }` -> `'default'` |

`getMetrics()` iki dünyayı birlikte bildirir: `layoutSize` (sanal), `regionSize` (gerçek, CSS px), `scale` (`{ x, y }`, gerçek / sanal), `layoutSource` ve `layoutDerived` (eski `layout`, `region`, `scaleX`, `scaleY` alanları duruyor).

**Varsayılan neyi değiştirir?** libass ve VSFilter, betikte PlayRes yoksa 384x288'e düşer. PAR'ın varsayılanı bunun yerine 1280x720'dir; çoğu modern betik ve oynatıcı bunu varsayar. Betikteki her şey sanal uzayda bir sayıdır, bu yüzden varsayılan, görünüm boyutunu belirler: `Fontsize: 20`, 384x288'de görüntü yüksekliğinin %6,9'u, 1280x720'de %2,8'idir; kenarlık, gölge, boşluk ve konumlar da aynı oranda ölçeklenir. PlayRes'siz, libass için yazılmış bir betik PAR'ın varsayılanında libass'e göre yaklaşık 2,5 kat küçük görünür. Katı libass uyumluluğu için `defaultLayout: 'libass'` kullanın. PlayRes taşıyan betikler etkilenmez.

## Kare zamanları: bir satır ne zaman görünür

Bir satır başlangıcından bitişine kadar görünür, **bitiş anı dahil değildir** (`startMs <= t < endMs`). Bir satır tam sonrakinin başladığı anda biterse (`1.00` - `1.00`, çok yaygın) o anda ilki gider, ikincisi gelir: asla ikisi birden, asla ikisi de yok. Bitişi başlangıcından sonra olmayan satır hiç görünmez. Her karşılaştırma **tamsayı milisaniye** ile yapılır: ASS zamanları santisaniyedir, medya zamanı tek seferde `Math.round(t * 1000)` ile çevrilir (mpv'nin libass'i çağırmadan önce yaptığı gibi); böylece `0.1 + 0.2` gibi ondalık hatalar sınırı kaydıramaz. `\fad`, `\t`, `\move` ve karaoke zamanları da aynı tamsayı tabanını kullanır (satır başından itibaren ms).

`videoFps` verilirse zaman önce **karenin başlangıcına** oturur: `n`. kare tam `n / fps` anında değerlendirilir (NTSC hızları 23.976, 29.97, 59.94 tam kesirlerdir: 24000/1001, 30000/1001, 60000/1001; ondalık birikim yok), tek yuvarlamayla ms'ye çevrilir. 24 fps'te `2.02`'de başlayan satır ilk kez `2.042 sn` karesinde görünür, `2.000 sn` karesinde değil; `1.00`'de biten satır `1.000 sn` karesinde artık yoktur. `fps` (PAR'ın ne sıklıkla çizdiği) ile `videoFps` (zamanın oturduğu kare ızgarası) birbirinden bağımsızdır. Deneme alanındaki "Time boundaries" presetini deneyin ve Lab'da kare kare ilerleyin.

## Büyük dosyalar: pencereli kaynaklar

`subtitle` bir `SubtitleSource` da alır: bu durumda çizici bellekte yalnızca kayan bir olay penceresi tutar (oynatma konumunun yaklaşık 2 sn gerisi, 10 sn ilerisi; `windowSeconds: 12`), ileriyi dilimler halinde okur, atlamayla geçersiz kalan okumaları iptal eder ve olayları henüz yüklenmemiş bir zaman için yanlış satırlar yerine **hiçbir şey** çizmez. 100 MB'lık bir betik, bellekte yalnızca birkaç saniyesiyle oynar.

```ts
import { create } from 'pulsar-ass-renderer';
import { fromAssFile, openSourceInWorker } from 'pulsar-ass-renderer/source';

const source = await openSourceInWorker(file, {            // File ya da Blob: .ass, .ssa, .xpar veya .par (içerikten anlaşılır)
  worker: () => new Worker(new URL('pulsar-ass-renderer/worker', import.meta.url), { type: 'module' }),
  onProgress: (bytes, total) => bar.update(bytes / total), // 100 MB'ı indekslemek birkaç saniye sürer
});
const par = create({ video, subtitle: source, windowSeconds: 12 });
par.getSourceStats(); // { windowEvents, windowRange: [başlangıç, bitiş] | null, loading, bytesRead, decodeMs, indexMs }
```

Bağdaştırıcılar (`pulsar-ass-renderer/source`): `fromAssText(text)` (ana girişten de dışa aktarılır), `fromAssFile(blob)` (tek akış geçişi küçük bir zaman indeksi kurar, pencereler `Blob.slice` ile okunur; metin hiçbir zaman tek string olarak tutulmaz), `fromXpar(blobOrUrl)` ve `fromPar(...)` (yalnız pencerenin parçaları okunur ve çözülür; URL için HTTP Range gerekir), `openSource(blob)` (türü anlar) ve `openSourceInWorker(blob, { worker })` (indeksleme ve çözme bir Worker'da; Worker verilmezse ana iş parçacığında parçalı asenkron okumaya düşer). Olayları başka yerden beslemek için `SubtitleSource` arayüzünü kendiniz uygulayın: `{ script, duration, eventCount, readWindow(t0, t1, signal?) }`; pencereler tamsayı ms üzerinde yarı açıktır, olaylar `parseScript`'in verdiği yapılardır (aynı id'ler). Fontlar: stiller başlangıç kümesini verir, override'larla kullanılan fontlar pencereleri geldikçe eklenir, `[Fonts]` kaynaktan okunur (`fontSection()`); "font eksik" akışı değişmeden çalışır.

## Lab

[Sitenin Lab bölümü](https://pulsariums.github.io/PAR/#lab-root) kendi `.ass` / `.ssa` / `.xpar` / `.par` dosyanızı açar (hiçbir şey yüklenmez): dosya boyutu ve istatistikler, gerçek **XPAR** boyutu ve seçilen fps'te **PAR** (kayıplı) boyutu (küçük dosyalarda kesin; büyüklerde belirtilen payla örnekleme tahmini, ardından istek üzerine kesin, ilerleme ve iptalle; `name.xpar` ve `name.<fps>fps.par` indirilir), değiştirilebilir varsayılan (720p / libass 384x288 / özel) ve geçersiz kılma ile sanal ve gerçek boyut, ve uzunluğu altyazının süresi olan bir zaman çizgisi oynatıcısı: atlama, kare / 1 sn / 5 sn adımları, önceki / sonraki satır, hız, döngü, çizim fps ve video fps, klavye kısayolları (Boşluk ya da K, oklar, Shift + oklar, J / L, [ / ], Home / End) ve canlı pencere ve zamanlama değerleri. Büyük dosyalar bir Worker'da indekslenir ve çözülür. `.par` kayıplıdır: özgün ASS'yi geri üretemez ve yalnızca hedef fps'inde görsel olarak eşdeğerdir.

## Fontlar

Betikler font adı verir; PAR tarayıcıya bu fontları kullandırır. ASS font adı (baştaki `@` atılır, büyük/küçük harf duyarsız) şu sırayla çözülür: **yüklü yüz** (önce kullanıcı, sonra gömülü) -> `fontMap` -> **sağlayıcı yüzü** (`fontProviders`) -> **`useLocalFonts` ile yüklü font** -> sistem fontu -> genel `sans-serif` yedeği (`missing` diye raporlanır). Kalın/italik için gerçek yüz yüklüyse o seçilir; yoksa tarayıcı yapay çizer ve rapor bunu belirtir (libass kuralı: istenen ağırlık > yüz ağırlığı + 150).

```ts
const par = create({ video, subtitle, fonts: [fontFile] });   // File | Blob | ArrayBuffer | URL | .zip
await par.addFonts(input.files);     // toplu; aile adı fontun `name` tablosundan okunur (TTF, OTF, TTC, WOFF, WOFF2*)
await par.ready;                     // tüm font yüklemeleri bitti ve yeniden yerleşim yapıldı
par.getFontReport();                 // { fonts: [{ name, status: 'embedded'|'user'|'provider'|'local'|'system'|'missing', styles, lines, ... }], missing, pending, warnings }
par.listFonts(); par.removeFont(id); par.onFontsChange(fn);
await par.loadLocalFonts();          // tıklamadan çağırın: Local Font Access API, desteklenmiyorsa/reddedilirse false
```

- **Gömülü fontlar**: `[Fonts]` bölümü (SSA/ASS uuencode, birden çok font, kısmi son satır) çözülür ve `document.fonts`'a kaydedilir. Aynı baytlar bir kez kaydedilir, çizici başına sayılır; `destroy()` bırakır.
- **Yükleme zamanı**: betiğin fontları yüklenirken metin çizilmez; sonra satırlar doğru fontla kurulup ölçülür (karede bekleme yok).
- **Font ölçüsü**: libass `\fs` değerini `usWinAscent + usWinDescent` toplamına eşitler (libass `ass_font.c`, `set_font_metrics` / `ass_face_set_size`'tan okundu). Yüklü fontlarda PAR `font-size = fs * unitsPerEm / (winAscent + winDescent)` kullanır (yedek: hhea, typo, bbox; libass sırası). Sistem fontlarında tarayıcının canvas `fontBoundingBox` ascent + descent değeri ölçülür (çoğunlukla hhea tabanlı; win ile hhea farklı fontlarda libass'tan sapabilir); metrik yoksa eski 0.9 çarpanı kalır. Gerçek libass çıktısıyla piksel piksel karşılaştırılmadı.
- **Sınırlar**: PAR font dağıtmaz ve alt kümeleme yapmaz; gömülü fontlar betik yazarından gelir, lisanslarına dikkat edin. `[Graphics]` yok sayılır. Tarayıcılar TTC'nin yalnız ilk yüzünü yükler, PAR her üyeyi ayıklar. WOFF2 adı için `DecompressionStream('brotli')` gerekir (yoksa dosya adı aile olur; `{ family }` verin). Font sayfa geneline kaydolur: aynı aile/ağırlık/stilde farklı iki font çakışır. `queryLocalFonts` yalnız Chromium'da var ve headless'ta denenmedi. `\fe` ve font kodlamaları yok sayılır.

### Font sağlayıcıları, ön kontrol (preflight) ve "font eksik" akışı

**Çözümleme sırası** (baştaki `@` atılır, büyük/küçük harf fark etmez): kullanıcı yüzü -> gömülü `[Fonts]` yüzü -> `fontMap` -> **`fontProviders` (dizi sırası)** -> `useLocalFonts` ile yüklü font -> sistem fontu -> genel yedek (`missing`). Sağlayıcı yüzü yalnız öncesindeki hiçbir şey adı karşılamıyorsa kullanılır; kalın istenip sağlayıcı yüzü normalse PAR sağlayıcıdan kalın varyantı da ister.

```ts
import { create, createUrlProvider, preflightScript, createMissingFontsPrompt } from 'pulsar-ass-renderer';
import { FontLibrary } from 'pulsar-ass-renderer/fontlib';

const library = await FontLibrary.open();                       // kullanıcının kendi kalıcı font deposu (IndexedDB)
const par = create({
  video, subtitle,
  fontProviders: [library.asProvider(), createUrlProvider('cdn', { 'Open Sans': 'https://example.com/OpenSans.woff2' })],
  onMissingFonts: () => 'continue',                             // ya da 'wait' / Promise
});
par.on('missingfonts', (report) => showPrompt(report));          // eksik küme değişince yine tetiklenir (ok: true dahil)

const report = await preflightScript(assText, { fontProviders: [library.asProvider()] });   // çizici ve DOM gerekmez
// { ok, resolved[], missing[], synthetic[], providerHits, missingGlyphs, warnings, stats }
await par.preflight();                  // yüklü betik için aynısı; par.preflight(baskaMetin) o betiğin fontlarını sağlayıcılardan önceden yükler
```

- **Sağlayıcı**: `{ name, has?(family), get(family, { weight, italic }) -> bayt | Blob | URL | zip | null, subscribe?(fn) }`. Hata veren, yavaş (`providerTimeout`) ya da bozuk sağlayıcı yalnız uyarı üretir. `subscribe` ile sağlayıcı yeni font geldiğini bildirir; yoksa `par.refreshProviders()` çağırın. `createUrlProvider(ad, urlTablosu | { manifest })` tembel indirir, URL başına bir kez (CORS geçerli).
- **Preflight**, Style bölümünü ve her `{...}` bloğunu (`\fn`, `\b`, `\i`, `\r`, `\p`; `\t(...)` font değiştiremez) çizicinin kullandığı aynı ayrıştırıcıyla, olay nesnesi kurmadan tarar: bellek betik boyutuyla büyümez. Girdi: metin, satır iterable'ı / async iterable'ı, indirilen akış için `linesFromChunks(stream)`; ya da başka yerden biliniyorsa yalnız `usedFonts: ['Arial', { family, bold, italic }]` (dev dosyalar için `signal`, `onProgress`). Akışta Style bölümü olaylardan önce gelmelidir (yoksa uyarı verilir). `synthetic`: kalın/italiğin taklit edileceği fontlar; `missing`: hiçbir kaynağın karşılamadığı fontlar.
- **Eksik glifler**: PAR'ın yüz olarak tuttuğu fontlar (kullanıcı, gömülü, sağlayıcı, yerel) için kullanılan karakterler (`usedCharacters(metin)`: etiket, `\N` `\h` ve çizim yok) fontun `cmap` tablosuyla (format 4 ve 12) karşılaştırılır: `report.missingGlyphs[family] = { count, sample }` (örnek en çok 64 kod noktası). Sistem fontları denetlenemez. Bu bir uyarıdır, `ok` true kalır.
- **Karar**: betiğin fontları oturduğunda ve bazıları eksikse `onMissingFonts(report, ctrl)` betik başına bir kez çağrılır. `'continue'` (varsayılan) yedek fontla çizer. `'wait'` ya da bekleyen Promise, eksik aile kullanan her olayı (diğerleri normal çizilir) `ctrl.continue()` / `par.continueWithMissing()` çağrılana ya da fontlar gelene kadar tutar. Fırlatma / reddetme = devam. `par.ready`, tüm font işleri bitince ve kanca *çağrıldıktan* sonra çözülür; kullanıcıyı asla beklemez.
- **Uyarı yardımcısı** (isteğe bağlı, CSS'siz, modal değil): `createMissingFontsPrompt(container, report, { onContinue, onAddFonts, texts })` "X fontu eksik. Yine de devam edilsin mi? [Devam et] [Font ekle]" iletisini `alertdialog` olarak, gerçek ve hep görünen düğmelerle çizer; Escape kapatır; metinler sizin (i18n).
- **Font kütüphanesi** (`pulsar-ass-renderer/fontlib`, ayrı ~11 kB gzip giriş, çekirdek içe aktarmaz): `FontLibrary.open(ad = 'par-fonts')`, `add(dosyalar | zip)` (SHA-256 ile tekilleştirme), `list()` (yalnız üst veri, baytlar tembel yüklenir), `lookup(ad)` / `find(ad, weight, italic)` aile, tam ad, PostScript adı ya da alias ile (harf duyarsız, `@` yok sayılır), `remove(idler)`, `setAliases(id, adlar)`, `coverage(id)`, `usage()` + `requestPersistence()` (`navigator.storage`), `exportZip()`, `repair()`, `onChange(fn)`, `asProvider()`. Arayüz yardımcıları: `scriptBadges` (Latin, Türkçe/Azerice dahil Latin Genişletilmiş, Kiril, Yunanca, Hiragana, Katakana, Kanji örneklemi, semboller), `blockStats`, `sliceCps`. Playground'un Yazı tipleri sekmesi eksiksiz bir örnektir (önizleme, sayfalı karakter ızgarası, gruplama, arama, toplu silme).
- **Hukuki / ürün notu**: PAR font barındırmaz ve dağıtmaz; ortak font barındırma özelliği yoktur. Kütüphane kullanıcının kendi yerel deposudur; font, ana uygulama kendisi yapmadıkça cihazdan çıkmaz. Font lisanslarına uyun.
- **Sınırlar**: sağlayıcı yüzleri sağlayıcı listesi değişene ya da çizici yok edilene kadar kayıtlı kalır; şemanın tek sürümü var (göç altyapısı hazır, henüz göç yok); `exportZip` sıkıştırmaz ve alias'ları geri aktarmaz; Safari `persist()` olmadan IndexedDB'yi silebilir; glif denetimi yalnız `cmap` kullanır (GSUB / yedek şekillendirme yok); WOFF2 adlar için Brotli ister.

## Desteklenen etiketler

Durumlar, deneme alanındaki özellik test tablosuyla aynıdır; orada her satır, gözle doğrulayabileceğiniz bir örnek yükler.
**Çiziliyor** = DOM'da çizilir. **Yaklaşık** = çizilir ama libass'ten bilinen bir yönüyle ayrılır. **Desteklenmiyor** = çizilmez.

<details open>
<summary><b>Etiket destek tablosu</b></summary>

| Etiket / özellik | Durum | Notlar |
|---|---|---|
| `\pos` `\move(x1,y1,x2,y2[,t1,t2])` | Çiziliyor | Satırdaki ilk `\pos`/`\move` geçerlidir (libass). |
| `\an` `\a` | Çiziliyor | İlki geçerli; eski `\a` dönüştürülür. |
| `\org` `\frx` `\fry` `\frz` `\fr` | Çiziliyor | Sabit perspektifli 3B; `\org` varsayılanı bağlantı noktasıdır. |
| `\fad` `\fade` | Çiziliyor | Satır opaklığı, ilki geçerli. |
| `\clip` `\iclip` (dikdörtgen) | Çiziliyor | Tüm olay üzerinde CSS `clip-path`, betik koordinatlarında (`\pos`/`\move`/döndürmeyi izlemez). Sonuncusu geçerli; köşeler yer değiştirilmez (boş dikdörtgen satırı gizler, libass gibi); `\t` ile tüm betik alanından canlandırılabilir. Kenarlar yumuşatılır (libass tam piksele keser). |
| `\clip` `\iclip` (vektör, ölçekli) | Çiziliyor | İlk vektör kırpma geçerli olur ve dikdörtgen kırpmayla birlikte uygulanır (libass). Canlandırılamaz (libass'teki gibi). |
| `\t([t1,t2,][accel,]etiketler)` | Çiziliyor | Çoklu etiket, isteğe bağlı süre, ivme, kaynak sırasında değerlendirme. |
| `\k` `\K` `\kf` `\ko` `\kt` | Çiziliyor | Renk değişimi, süpürme, kenar açılması. |
| `\r` `\r<stil>` | Çiziliyor | Bilinmeyen stil satır stiline düşer. |
| `\fn` `\fs` (`\fs+n`/`\fs-n`) `\fscx` `\fscy` `\fsp` | Çiziliyor | Yazı tipi `fontMap` ya da adın kendisiyle. |
| `\fax` `\fay` | Çiziliyor | Eksen noktası metnin sol üstüdür. Parça başına farklar ilk parçanın değerini kullanır. |
| `\b` `\i` `\u` `\s` | Çiziliyor | |
| `\bord` `\shad` `\xshad` `\yshad` | Çiziliyor | Bulanıklık ya da yarı saydam dolgu gerektirdiğinde gölge, kenar ve dolgu ayrı katmanlardır; yarı saydam dolgu, libass gibi harfi kenardan oyar. CSS çizgi köşeleri sivridir, libass yuvarlar. |
| `\xbord` `\ybord` | Yaklaşık | x/y farklıysa büyük değeri kullanır. |
| `\blur` | Çiziliyor | libass'in sigma değeriyle Gauss (`blur * 0.849`); kenar varsa yalnız kenar ve gölge bulanır, dolgu keskin kalır (libass). Bulanıklık `ScaledBorderAndShadow` ile ölçeklenmez. `\fscx`/`\fscy` oranıyla uzar, `\fax`/`\frx` ile eğilir; libass son bitmap'i bulanıklaştırır. |
| `\be` | Yaklaşık | libass'in 3x3 kutu çekirdeğinin N geçişi, sigma = sqrt(N/2) aygıt pikseli olan tek bir Gauss ile modellenir; libass'in yuvarlaması ve 127 sınırı uygulanır. |
| `\c` `\1c`..`\4c` `\alpha` `\1a`..`\4a` | Çiziliyor | |
| `\p<n>` çizimler (`m n l b s p c`), `\pbo` | Çiziliyor | SVG yolu; spline kapatma (`c`) düz kapatmadır. |
| `\q1` `\q2` | Çiziliyor | Normal sarma / sarma yok. |
| `\q0` `\q3`, `WrapStyle` 0 ve 3 | Yaklaşık | CSS `text-wrap: balance` kullanır. |
| `\N` `\n` `\h` | Çiziliyor | |
| BorderStyle 1 ve 3 | Çiziliyor | Kenar+gölge / opak kutu. |
| Katmanlar, çarpışma dizilimi, yorumlar | Çiziliyor | Konumsuz satırlar dizilir ve yerini korur; `Comment:` atlanır. |
| `\fe` | Desteklenmiyor | Ayrıştırılır ve yok sayılır (web yazı tipleri için anlamı yok). |
| Olay `Effect` alanı (`Banner;`, `Scroll up;`, `Scroll down;`) | Desteklenmiyor | |
| Çizimlerde `\kf` süpürmesi | Desteklenmiyor | Çizimler rengi sonda değiştirir. |
| `[Graphics]`, BorderStyle 4, LayoutResX/Y düzeltmesi | Desteklenmiyor | `LayoutResX/Y` ayrıştırılır ama kullanılmaz. |
</details>

<details>
<summary><b>Bilinen sınırlamalar</b></summary>

- **Glif ölçüleri.** Metni tarayıcı şekillendirir ve çizer; `\fs` CSS'e sabit bir oranla (0,9) eşlenir. Bu yüzden genişlik, satır yüksekliği ve hinting libass'ten az da olsa farklıdır.
- Dönüşü satırın ilk parçasından farklı olan parça kendi merkezi etrafında döner; `\fscx`/`\fscy` oranı farklı olan parça satır içi bloğa dönüşür (içinde satır kaydırma olmaz); bir `\kf` hecesi satırlara bölünemez.
- PlayRes en-boy oranı videodan farklı olan betik gerilir (VSFilter gibi).
- `ScaledBorderAndShadow` yoksa varsayılan `yes`'tir (libass); VSFilter bunu `no` sayar.
- Linux'ta headless Chromium'da pozitif `\fax` değerlerinin glif eğimi olmadan çizildiğini gözlemledik (negatif değerler doğru). Bu bir rasterizer sorunu gibi görünüyor, PAR dönüşümüyle ilgili değil.
</details>

## PAR başka çözümlerle nasıl kıyaslanır

<details>
<summary><b>PAR ve libass-wasm, JASSUB, SubtitlesOctopus</b></summary>

libass-wasm, JASSUB ve SubtitlesOctopus, referans C kütüphanesi **libass**'ı WebAssembly'ye derleyip canvas'a çizer.
PAR farklı bir denge seçer: libass'i içine gömmez, çizimi tarayıcıya bırakır.

| | PAR | libass-wasm / JASSUB / SubtitlesOctopus |
|---|---|---|
| Yaklaşım | DOM, SVG ve CSS | WebAssembly'ye derlenmiş libass |
| Dağıtılacak WASM dosyası | Yok | Var (bir de worker betiği) |
| Boyut | Gzip ile yaklaşık 30 kB, sıfır bağımlılık | Daha büyük: derlenmiş kütüphaneyi taşır |
| Framework | Gerekmez, saf TypeScript | Düz JS, her birinin kendi kurulumu var |
| Çıktı | Gerçek DOM düğümleri ve SVG | Canvas üzerinde pikseller |
| Glifi libass ile birebir çıktı | Hayır (yaklaşımlar yukarıda listeli) | Evet, libass kullanmanın amacı bu |
| Gömülü yazı tipleri | Destekleniyor (`[Fonts]`) | libass tabanlı çizicilerde destekleniyor |

Piksel sadakati ve eksiksiz etiket desteği en önemliyse libass tabanlı bir çizici seçin. Küçük, WASM'siz ve incelenebilir bir
DOM çizici yetiyorsa PAR'ı seçin. Güncel ayrıntılar için her projenin kendi belgelerine bakın.
</details>

## Tarayıcı desteği

Güncel tarayıcılar: Chrome/Edge 88+, Firefox 97+, Safari 13.1+ (CSS `clip-path: path()`, `ResizeObserver`). İsteğe bağlı özellikler
yoksa zarifçe geri düşer: `requestVideoFrameCallback` (yoksa rAF), HTML metinde `paint-order` (Chrome 123+, Firefox, Safari; yoksa kenar
harfin iç yarısını da kaplar), `text-wrap: balance` (yoksa açgözlü satır kaydırma).

## SSS

<details>
<summary>Çıktı libass ile aynı mı?</summary>

Hayır. PAR etiket önceliği ve zamanlamada libass kurallarını izler, ama glifleri tarayıcı çizdiği için ölçüler hafifçe farklıdır. Durum tablosuna bakın.
</details>

<details>
<summary>HLS, DASH ya da başka akış oynatıcılarıyla çalışır mı?</summary>

PAR zamanı standart bir `<video>` elemanından (ya da sizin `clock` fonksiyonunuzdan) okur; `<video>` içinde oynayan her şey çalışır. Oynatıcınız `<video>` kullanmıyorsa `container` ve `clock` verin.
</details>

<details>
<summary>React, Vue ya da Svelte ile nasıl kullanırım?</summary>

Eleman oluştuktan sonra (effect / `onMount`) `create` çağırın, temizlikte `par.destroy()` çağırın. PAR'da framework kodu yoktur ve kendi katman elemanı dışında bileşen ağacınıza dokunmaz.
</details>

<details>
<summary>Altyazı zamanlamasını nasıl düzeltirim?</summary>

`timeOffset` (saniye; pozitif değer altyazıyı geciktirir) kullanın; kare kare yuvarlama için `videoFps` verin.
</details>

<details>
<summary>Tam ekranda altyazı görünmüyor, neden?</summary>

Tam ekranda yalnız tam ekran elemanının alt ağacı gösterilir. Tam ekranı yalnız `<video>` için değil, video ile PAR katmanını birlikte barındıran konteyner için isteyin.
</details>

<details>
<summary>Gömülü yazı tipleri nasıl çalışır?</summary>

`[Fonts]` bölümünden çözülür ve tarayıcıya kaydedilir. Bkz. [Fontlar](#fontlar).
</details>

## Katkı

Sorunlar ve çekme istekleri (pull request) memnuniyetle karşılanır. Kurulum, kontroller ve bakımcı notları (bir kerelik
**Settings → Pages → Source: GitHub Actions** adımı dahil) için [CONTRIBUTING.md](CONTRIBUTING.md) dosyasına bakın.
Güvenlik sorunlarını [SECURITY.md](SECURITY.md) içinde anlatıldığı gibi bildirin.

## Bakımcılar için: GitHub Pages

`site/` içindeki site, `main`'e her push'ta `.github/workflows/pages.yml` ile yayımlanır. Bir kerelik kurulum: **Settings → Pages →
Build and deployment → Source: GitHub Actions**. Ayrıntılar [CONTRIBUTING.md](CONTRIBUTING.md) içinde.

## Lisans

MIT, (c) Pulsariums. Bkz. [LICENSE](LICENSE).
