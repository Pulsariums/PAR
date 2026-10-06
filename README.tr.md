<div align="center">

[English](README.md) · **Türkçe** · [Русский](README.ru.md)

<img src="assets/banner.svg" alt="PAR - Pulsar ASS Renderer: proje adının üzerinde animasyonlu karaoke dolgusu" width="100%" />

<p>
  <a href="LICENSE"><img alt="Lisans: MIT" src="https://img.shields.io/github/license/Pulsariums/PAR?color=5b3df5" /></a>
  <a href="https://github.com/Pulsariums/PAR/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Pulsariums/PAR/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/Pulsariums/PAR/actions/workflows/pages.yml"><img alt="Pages" src="https://github.com/Pulsariums/PAR/actions/workflows/pages.yml/badge.svg" /></a>
  <img alt="Sürüm" src="https://img.shields.io/github/package-json/v/Pulsariums/PAR?color=5b3df5" />
  <img alt="Boyut: gzip ile yaklaşık 22 kB" src="https://img.shields.io/badge/gzip-~22%20kB-5b3df5" />
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
| **Sıfır bağımlılık** | Gzip ile yaklaşık 22 kB. Saf TypeScript; çalışma zamanında paket ya da WASM indirmesi yok. |
| **DOM, SVG ve CSS** | Metin gerçek metin olarak kalır, çizimler SVG yoludur, harfleri tarayıcının kendi yazı motoru şekillendirir. |
| **Tak ve çalıştır** | `create({ video, subtitle })`. Letterbox, yeniden boyutlandırma, oynat, duraklat ve sarma izlenir. |
| **libass kurallarına yakın** | Etiket önceliği, `\t` sırası, karaoke zamanlaması ve PlayRes yedekleri libass'teki gibidir. |
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
| `subtitle` | `string` | - | Ham `.ass` / `.ssa` metni. |
| `region` | `'video' \| 'container' \| {x,y,width,height}` | videoyla `'video'`, yoksa `'container'` | Altyazının yeri. `'video'`: videonun görünen resmi (letterbox'a duyarlı, `object-fit` dikkate alınır). Dikdörtgen: konteyner pikseli. |
| `layout` | `'script' \| {width,height}` | `'script'` | Sanal koordinat uzayı. `'script'` = PlayResX/PlayResY (libass yedekleriyle). Boyut verilirse betik o boyuta göre yazılmış sayılır. |
| `fps` | `'auto' \| number` | `'auto'` | Çizim hızı. `'auto'`: her video karesinde (`requestVideoFrameCallback`), yoksa her ekran karesinde. Sayı: 10..200 üst sınır (ekran tazeleme hızını aşamaz). |
| `videoFps` | `number \| null` | `null` | Kaynak videonun kare hızı. Verilirse zaman kare başına yuvarlanır. `fps`'ten bağımsızdır. |
| `clock` | `() => number` | `video.currentTime` | Özel saat (saniye). |
| `timeOffset` | `number` | `0` | Saate eklenen saniye (altyazı gecikmesi). |
| `fontMap` | `Record<string,string>` | `{}` | ASS yazı tipi adı -> CSS `font-family`. Yazı tiplerini `@font-face` ile siz yüklersiniz. |
| `fonts` | `FontSpec[]` | `[]` | Oluşturulurken yüklenecek fontlar (File, Blob, bayt, URL ya da `{ source, family }`). Bkz. [Fontlar](#fontlar). |
| `useLocalFonts` | `boolean` | `false` | Yüklü fontları Local Font Access API ile kullanır (Chromium, izin ister). Hiçbir zaman zorunlu değildir. |
| `embeddedFonts` | `boolean` | `true` | Betiğin `[Fonts]` bölümünü yükler. |
| `zIndex` | `number` | `1` | Katmanın z-index değeri. |

Geçersiz değerler hata fırlatır (`fps: 5` -> `RangeError`, sıfır boyutlu bölge -> `TypeError`).
</details>

## API

<details>
<summary><b>Başvuru</b></summary>

| Üye | Açıklama |
|---|---|
| `create(options)` / `new PARRenderer(options)` | Çizici oluşturur ve katmanını ekler. |
| `setSubtitle(text \| null)` | Altyazıyı yükler ya da temizler. Bozuk betikte hata fırlatmaz (`script.warnings`'e bakın). |
| `setOptions(patch)` | Seçenekleri çalışırken değiştirir; yalnız verilen anahtarlar değişir. `video`/`container` değişirse yeniden bağlanır. |
| `renderAt(seconds)` | `seconds` anını hemen çizer (`timeOffset` ve `videoFps` uygulanır). |
| `refresh()` | Bölgeyi yeniden ölçer ve geçerli anı yeniden çizer. |
| `getMetrics()` | `{ region, layout, scaleX, scaleY, time, activeLines, running }`. |
| `script` | Ayrıştırılmış betik (`ParsedScript`) ya da `null`. Salt okunur. |
| `element` | Katman kök elemanı. |
| `destroy()` | Katmanı, dinleyicileri, gözlemcileri ve döngüyü kaldırır. Sonraki çağrılar hata fırlatır. |

Saf (DOM'suz) yardımcılar da dışa aktarılır: `parseScript`, `parseText`, `parseBlock`, `parseTransition`, `lexOverrides`,
`parseDrawing`, `resolvePlayRes`, `fitRect`, `resolveRegion`, `resolveLayoutSize`, `stageTransform`, `VERSION` ve tüm türler.

**Yaşam döngüsü.** Video ile kullanımda döngü yalnız video oynarken çalışır; duraklatma, sarma, metadata ve boyut değişiminde tek kare çizilir.
Özel saat varsa ve video yoksa döngü sürekli çalışır (zaman değişmediyse iş yapmaz). İkisi de yoksa `renderAt()` çağırana kadar hiçbir şey çalışmaz.
Katman `pointer-events: none` kullanır, video kontrollerini engellemez.
</details>

## Fontlar

Betikler font adı verir; PAR tarayıcıya bu fontları kullandırır. ASS font adı (baştaki `@` atılır, büyük/küçük harf duyarsız) şu sırayla çözülür: **yüklü yüz** (önce kullanıcı, sonra gömülü) -> `fontMap` -> **`useLocalFonts` ile yüklü font** -> sistem fontu -> genel `sans-serif` yedeği (`missing` diye raporlanır). Kalın/italik için gerçek yüz yüklüyse o seçilir; yoksa tarayıcı yapay çizer ve rapor bunu belirtir (libass kuralı: istenen ağırlık > yüz ağırlığı + 150).

```ts
const par = create({ video, subtitle, fonts: [fontFile] });   // File | Blob | ArrayBuffer | URL | .zip
await par.addFonts(input.files);     // toplu; aile adı fontun `name` tablosundan okunur (TTF, OTF, TTC, WOFF, WOFF2*)
await par.ready;                     // tüm font yüklemeleri bitti ve yeniden yerleşim yapıldı
par.getFontReport();                 // { fonts: [{ name, status: 'embedded'|'user'|'local'|'system'|'missing', styles, lines, ... }], missing, pending, warnings }
par.listFonts(); par.removeFont(id); par.onFontsChange(fn);
await par.loadLocalFonts();          // tıklamadan çağırın: Local Font Access API, desteklenmiyorsa/reddedilirse false
```

- **Gömülü fontlar**: `[Fonts]` bölümü (SSA/ASS uuencode, birden çok font, kısmi son satır) çözülür ve `document.fonts`'a kaydedilir. Aynı baytlar bir kez kaydedilir, çizici başına sayılır; `destroy()` bırakır.
- **Yükleme zamanı**: betiğin fontları yüklenirken metin çizilmez; sonra satırlar doğru fontla kurulup ölçülür (karede bekleme yok).
- **Font ölçüsü**: libass `\fs` değerini `usWinAscent + usWinDescent` toplamına eşitler (libass `ass_font.c`, `set_font_metrics` / `ass_face_set_size`'tan okundu). Yüklü fontlarda PAR `font-size = fs * unitsPerEm / (winAscent + winDescent)` kullanır (yedek: hhea, typo, bbox; libass sırası). Sistem fontlarında tarayıcının canvas `fontBoundingBox` ascent + descent değeri ölçülür (çoğunlukla hhea tabanlı; win ile hhea farklı fontlarda libass'tan sapabilir); metrik yoksa eski 0.9 çarpanı kalır. Gerçek libass çıktısıyla piksel piksel karşılaştırılmadı.
- **Sınırlar**: PAR font dağıtmaz ve alt kümeleme yapmaz; gömülü fontlar betik yazarından gelir, lisanslarına dikkat edin. `[Graphics]` yok sayılır. Tarayıcılar TTC'nin yalnız ilk yüzünü yükler, PAR her üyeyi ayıklar. WOFF2 adı için `DecompressionStream('brotli')` gerekir (yoksa dosya adı aile olur; `{ family }` verin). Font sayfa geneline kaydolur: aynı aile/ağırlık/stilde farklı iki font çakışır. `queryLocalFonts` yalnız Chromium'da var ve headless'ta denenmedi. `\fe` ve font kodlamaları yok sayılır.

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
| `\clip` `\iclip` (dikdörtgen) | Çiziliyor | CSS `clip-path`; sonuncusu geçerli; `\t` ile canlandırılabilir. |
| `\clip` `\iclip` (vektör, ölçekli) | Çiziliyor | Canlandırılamaz (libass'teki gibi). |
| `\t([t1,t2,][accel,]etiketler)` | Çiziliyor | Çoklu etiket, isteğe bağlı süre, ivme, kaynak sırasında değerlendirme. |
| `\k` `\K` `\kf` `\ko` `\kt` | Çiziliyor | Renk değişimi, süpürme, kenar açılması. |
| `\r` `\r<stil>` | Çiziliyor | Bilinmeyen stil satır stiline düşer. |
| `\fn` `\fs` (`\fs+n`/`\fs-n`) `\fscx` `\fscy` `\fsp` | Çiziliyor | Yazı tipi `fontMap` ya da adın kendisiyle. |
| `\fax` `\fay` | Çiziliyor | Eksen noktası metnin sol üstüdür. Parça başına farklar ilk parçanın değerini kullanır. |
| `\b` `\i` `\u` `\s` | Çiziliyor | |
| `\bord` `\shad` `\xshad` `\yshad` | Çiziliyor | CSS metin kenarı ve gölgesi. |
| `\xbord` `\ybord` | Yaklaşık | x/y farklıysa büyük değeri kullanır. |
| `\blur` `\be` | Yaklaşık | Tüm parça üzerinde CSS `blur()` (dolgu ve kenar birlikte). |
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
| Boyut | Gzip ile yaklaşık 22 kB, sıfır bağımlılık | Daha büyük: derlenmiş kütüphaneyi taşır |
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
