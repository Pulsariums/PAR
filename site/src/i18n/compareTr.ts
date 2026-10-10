export const compareTr = {
  'nav.compare': 'Karşılaştırma',
  'cmp.title': 'PAR vs JASSUB vs libass',
  'cmp.lead': 'Tarayıcıya özgü saf TypeScript mimarisinin WebAssembly portları ve masaüstü referans kütüphanesiyle karşılaştırması.',
  'cmp.th.dimension': 'Ölçüt',
  'cmp.th.par': 'PAR',
  'cmp.th.jassub': 'JASSUB',
  'cmp.th.libass': 'libass',
  'cmp.th.par_badge': 'Saf Web',
  'cmp.th.jassub_badge': 'WASM Portu',
  'cmp.th.libass_badge': 'Masaüstü Referansı',

  'cmp.row.arch': 'Mimari / Çalışma Zamanı',
  'cmp.par.arch': 'Saf TypeScript / ESM (DOM, SVG ve Canvas2D Worker)',
  'cmp.jassub.arch': 'WebAssembly + Canvas (Emscripten ile derlenmiş C libass)',
  'cmp.libass.arch': 'Yerel C / C++ (Masaüstü ikilisi: mpv, VLC, Aegisub)',

  'cmp.row.size': 'Paket Boyutu / İndirme',
  'cmp.par.size': '~35 KB gzip (Sıfır harici bağımlılık)',
  'cmp.jassub.size': '~2.5–5 MB (WASM ikilisi + HarfBuzz + FreeType)',
  'cmp.libass.size': 'Yok (Masaüstü sistem kütüphanesi)',

  'cmp.row.startup': 'Başlatma Süresi',
  'cmp.par.startup': '<10 ms anında (Derleme yok, ilk kare derhal)',
  'cmp.jassub.startup': '300–800 ms (Ağ indirmesi ve WASM derlemesi)',
  'cmp.libass.startup': '<5 ms (Yerel masaüstü çalıştırma)',

  'cmp.row.render': 'Metin Çizimi ve Ölçekleme',
  'cmp.par.render': 'Keskin HiDPI/Retina SVG ve Canvas (Her yakınlaştırmada net)',
  'cmp.jassub.render': 'Sabit piksel kanvası (Bitmap ölçekleme, bulanıklaşabilir)',
  'cmp.libass.render': 'Doğrudan raster (Yerel glif birleştirme)',

  'cmp.row.a11y': 'Seçilebilir Metin ve Erişilebilirlik',
  'cmp.par.a11y': 'Evet (DOM içinde: ekran okuyucu, kopyalama, arama)',
  'cmp.jassub.a11y': 'Hayır (Opak kanvas pikselleri)',
  'cmp.libass.a11y': 'Hayır (Video katmanı pikselleri)',

  'cmp.row.memory': 'Bellek ve Mobil Performans',
  'cmp.par.memory': 'Düşük heap, pil dostu (Tarayıcı çöp toplayıcısı)',
  'cmp.jassub.memory': 'Ağır WASM heap (64MB+ sabit doğrusal bellek)',
  'cmp.libass.memory': 'Yok (Yerel işletim sistemi bellek yönetimi)',

  'cmp.row.parity': 'ASS Uyumluluk ve Davranış',
  'cmp.par.parity': 'Çift motorla yüksek web uyumu (Diyalog + Worker)',
  'cmp.jassub.parity': '%100 C uyumu (Doğrudan libass çalıştırma)',
  'cmp.libass.parity': 'Referans uygulama (ASS için fiili standart)',

  'cmp.card.frametimes.title': 'Kare Süreleri ve Takılmasız Oynatma',
  'cmp.card.frametimes.desc': 'Web videosunda akıcılık 16.6ms (60 fps) bütçesine sadık kalmayı gerektirir. WebAssembly worker’ları ile ana iş parçacığı arasında megabaytlarca piksel tamponu aktarmak mikro takılmalara yol açabilir. PAR diyalogları doğrudan CSS dönüşümleriyle çizer ve ağır çizimleri worker’a devrederek kare sürelerini kusursuz korur.',

  'cmp.card.wasm.title': 'WebAssembly’nin Görünmeyen Maliyeti',
  'cmp.card.wasm.desc': 'JASSUB libass, HarfBuzz ve FreeType kütüphanelerini 2.5–5 MB’lık bir WASM dosyası olarak paketler. Mobil bağlantılarda bu yükü indirmek ve derlemek gözle görülür gecikmelere neden olur ve 64MB+ doğrusal bellek ayırarak pil tüketimini artırır.',

  'cmp.card.dualpath.title': 'PAR’ın Çift Yollu Web Mimarisi',
  'cmp.card.dualpath.desc': 'Web tarayıcıları için özel tasarlandı: Standart diyalog satırları yerel DOM/SVG ile keskin altpiksel netliğinde ve tam erişilebilir çizilir. Karmaşık vektörler, kırpmalar ve animasyonlar ise arka plandaki Canvas2D worker havuzuna aktarılır. Böylece anında yükleme, net metinler ve sıfır bağımlılık elde edersiniz.',
};
