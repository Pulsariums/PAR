export const compareEn = {
  'nav.compare': 'Compare',
  'cmp.title': 'PAR vs JASSUB vs libass',
  'cmp.lead': 'How browser-native TypeScript compares with WebAssembly ports and desktop reference libraries.',
  'cmp.th.dimension': 'Dimension',
  'cmp.th.par': 'PAR',
  'cmp.th.jassub': 'JASSUB',
  'cmp.th.libass': 'libass',
  'cmp.th.par_badge': 'Pure Web',
  'cmp.th.jassub_badge': 'WASM Port',
  'cmp.th.libass_badge': 'Desktop Reference',

  'cmp.row.arch': 'Architecture / Runtime',
  'cmp.par.arch': 'Pure TypeScript / ESM (DOM, SVG & Canvas2D Worker)',
  'cmp.jassub.arch': 'WebAssembly + Canvas (C libass compiled via Emscripten)',
  'cmp.libass.arch': 'Native C / C++ (Desktop binary: mpv, VLC, Aegisub)',

  'cmp.row.size': 'Bundle Size / Download',
  'cmp.par.size': '~35 KB gzipped (Zero dependencies)',
  'cmp.jassub.size': '~2.5–5 MB (WASM binary + HarfBuzz + FreeType)',
  'cmp.libass.size': 'N/A (Embedded desktop system library)',

  'cmp.row.startup': 'Startup Time',
  'cmp.par.startup': '<10 ms instant (Zero compile, instantaneous first frame)',
  'cmp.jassub.startup': '300–800 ms (Network download & WASM compilation)',
  'cmp.libass.startup': '<5 ms (Native desktop execution)',

  'cmp.row.render': 'Text Rendering & Scaling',
  'cmp.par.render': 'Sharp HiDPI/Retina SVG & Canvas (Crisp at any zoom)',
  'cmp.jassub.render': 'Fixed raster canvas (Bitmap scaling, prone to blur)',
  'cmp.libass.render': 'Direct raster (Native glyph compositing)',

  'cmp.row.a11y': 'Selectable Text & A11y',
  'cmp.par.a11y': 'Yes in DOM (Screen readers, copy/paste, text search)',
  'cmp.jassub.a11y': 'No (Opaque canvas pixels)',
  'cmp.libass.a11y': 'No (Video overlay pixels)',

  'cmp.row.memory': 'Memory & Mobile',
  'cmp.par.memory': 'Low heap, battery-friendly (Browser-managed GC)',
  'cmp.jassub.memory': 'Heavy WASM heap (64MB+ allocated linear memory)',
  'cmp.libass.memory': 'N/A (Native OS memory management)',

  'cmp.row.parity': 'ASS Quirks Parity',
  'cmp.par.parity': 'High web parity with dual engine (Dialogue + Worker)',
  'cmp.jassub.parity': '100% C parity (Direct execution of libass)',
  'cmp.libass.parity': 'Reference implementation (De facto standard)',

  'cmp.card.frametimes.title': 'Frametimes & Stutter-Free Playback',
  'cmp.card.frametimes.desc': 'Web video playback demands consistent 16.6ms (60 fps) presentation. Passing multi-megabyte frame buffers between WebAssembly workers and the main thread induces latency and micro-stutter. PAR renders standard dialogue directly via CSS transforms and offloads heavy drawings, keeping frametimes rock solid.',

  'cmp.card.wasm.title': 'The Hidden Cost of WebAssembly',
  'cmp.card.wasm.desc': 'JASSUB packages libass, HarfBuzz, and FreeType into a 2.5–5 MB WebAssembly binary. On mobile connections, downloading and compiling this payload causes visible startup delays and locks 64MB+ of linear heap memory, impacting device battery life.',

  'cmp.card.dualpath.title': 'PAR’s Dual-Path Web Architecture',
  'cmp.card.dualpath.desc': 'Engineered specifically for web browsers: dialogue lines render in native DOM/SVG with crisp subpixel antialiasing and full accessibility. Complex drawings, clips, and transforms seamlessly route to an offscreen Canvas2D worker pool. You get instant load times, sharp text, and zero dependencies.',
};
