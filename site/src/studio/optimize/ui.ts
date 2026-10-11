import { t } from '../../i18n/i18n';
import { $ } from '../../player/dom';
import { copyText } from '../../player/snippet';
import { humanBytes } from '../../common/format';
import type { StudioSession } from '../session';

import { runForensicAnalysis, type ForensicResult } from './forensic';
import type { FromOptimizeWorker, ToOptimizeWorker } from './protocol';

/** Largest script read into memory here; bigger ones go through the command line (`par optimize`). */
export const MAX_OPTIMIZE_BYTES = 120 * 1024 * 1024;

/** `name.ass` => `name.optimized.ass`. */
export const optimizedName = (name: string): string => `${name.replace(/\.(ass|ssa|txt)$/i, '')}.optimized.ass`;

export const OPTIMIZE_HTML = `
<details class="st-fold" id="stOptimize">
  <summary><span data-i18n="st.optTitle">⚡ Optimizasyon & Adli Bilişim Denetçisi</span></summary>
  <p class="hint" data-i18n="st.optDesc">
    Altyazıyı yapıştırın, zaman aralığını seçin ve oynatıcıda çalıştırmadan önce altyazının nerede takılacağını, hangi işlerin hangi sırayla çalıştığını ve PAR optimizasyon kazançlarını mikrosaniye hassasiyetinde görün.
  </p>

  <div class="fld">
    <label for="stOptAssInput"><strong>ASS Altyazı Metni:</strong></label>
    <textarea id="stOptAssInput" spellcheck="false" rows="8" placeholder="[Script Info]&#10;...&#10;Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,{\\blur60\\t(0,350,\\blur6)}Örnek Altyazı"></textarea>
  </div>

  <div class="row" style="margin-top: 6px; flex-wrap: wrap; gap: 6px;">
    <button type="button" class="btn sm" id="stOptLoadCurrent">Oynatıcıdaki Altyazıyı Çek</button>
    <button type="button" class="btn sm" id="stOptLoadReZero">Re:Zero S04E06 (Yoğun Efektler)</button>
    <button type="button" class="btn sm" id="stOptLoadYomi">Yomi no Tsugai Ending (Karaoke & Blur)</button>
  </div>

  <div class="row" style="margin-top: 10px; align-items: flex-end; flex-wrap: wrap; gap: 8px;">
    <label class="fld" style="margin: 0;">
      <span>Başlangıç (sn):</span>
      <input type="number" id="stOptStartSec" min="0" step="0.1" value="1320" style="width: 90px;" />
    </label>
    <label class="fld" style="margin: 0;">
      <span>Bitiş (sn):</span>
      <input type="number" id="stOptEndSec" min="0" step="0.1" value="1335" style="width: 90px;" />
    </label>
    <label class="fld" style="margin: 0;">
      <span>Simülasyon FPS:</span>
      <select id="stOptFps" style="width: 80px;">
        <option value="24" selected>24 fps</option>
        <option value="30">30 fps</option>
        <option value="60">60 fps</option>
      </select>
    </label>
    <button type="button" class="btn sm primary" id="stOptRun" style="height: 32px; font-weight: bold;">
      🔍 Derinlemesine Analiz Et ve Hesapla
    </button>
  </div>

  <div class="row" style="margin-top: 6px; gap: 6px; font-size: 12px;">
    <span style="opacity: 0.8;">Hızlı Aralık:</span>
    <button type="button" class="btn sm" id="stOptQuickAll">Tüm Dosya</button>
    <button type="button" class="btn sm" id="stOptQuickIntro">0 - 10s (Açılış)</button>
    <button type="button" class="btn sm" id="stOptQuickEnding">1320 - 1335s (Yoğun Efekt)</button>
  </div>

  <p class="hint" id="stOptStatus" role="status" style="margin-top: 8px; font-weight: 500;"></p>

  <div id="stOptResults" hidden style="margin-top: 14px; display: flex; flex-direction: column; gap: 14px;">
    <!-- Kazanç ve Karşılaştırma Kartı -->
    <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 12px;">
      <h3 style="margin: 0 0 6px 0; color: #10b981; font-size: 14px;">🚀 PAR Optimizasyon Kazanç Raporu (Normal vs PAR Optimize)</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 8px;">
        <div style="background: rgba(0,0,0,0.15); padding: 8px; border-radius: 6px;">
          <div style="font-size: 11px; opacity: 0.8;">SVG Blur \\blur60 Mutasyonları:</div>
          <div style="font-size: 16px; font-weight: bold; margin-top: 2px;" id="stOptBlurGains">0 / 0 (%0)</div>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">Önceden her karede 12.6 MP filter mutasyonu varken, PAR memoization ve adaptif kuantizasyon ile gereksiz GPU rasterization engellendi.</div>
        </div>
        <div style="background: rgba(0,0,0,0.15); padding: 8px; border-radius: 6px;">
          <div style="font-size: 11px; opacity: 0.8;">Zaman Çizelgesi Sıralaması:</div>
          <div style="font-size: 16px; font-weight: bold; margin-top: 2px;" id="stOptTimelineGains">0 µs</div>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">Önceden her karede O(N log N) sıralama varken, PAR lastT memoization ile sorgular 0 µs'ye indirildi.</div>
        </div>
        <div style="background: rgba(0,0,0,0.15); padding: 8px; border-radius: 6px;">
          <div style="font-size: 11px; opacity: 0.8;">Tahmini Tepe Gecikme (Spike):</div>
          <div style="font-size: 16px; font-weight: bold; margin-top: 2px;" id="stOptSpikeGains">0 ms -> 0 ms</div>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">Satır değişim anlarındaki tepe donma süreleri minimize edildi.</div>
        </div>
      </div>
    </div>

    <!-- Script Dağılımı ve Risk Faktörleri -->
    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px;">
      <h3 style="margin: 0 0 6px 0; font-size: 13px;">📊 Altyazı Mimarisi & Yönlendirme Analizi</h3>
      <div id="stOptArchGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; font-size: 12px;"></div>
    </div>

    <!-- Kritik Darboğazlar / Hotspots -->
    <div id="stOptHotspotsBox" style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px;">
      <h3 style="margin: 0 0 6px 0; color: #ef4444; font-size: 13px;">⚠️ Tespit Edilen Kritik Takılma / Donma Noktaları (Hotspots)</h3>
      <div id="stOptHotspotsList" style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;"></div>
    </div>

    <!-- Satır Değişimi Anlarında Adli İnceleme (Micro-timing Transitions) -->
    <div style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px;">
      <h3 style="margin: 0 0 4px 0; color: #3b82f6; font-size: 13px;">⏱️ Satır Değişimi Anlarında Adli İnceleme (Öncesi - Tam Anı - Sonrası)</h3>
      <p style="margin: 0 0 8px 0; font-size: 11px; opacity: 0.8;">
        Donmanın gerçekleştiği mikro saniyenin 16ms öncesi, geçiş anı ve 16ms sonrasındaki DOM mutasyonları ve Reflow yükleri:
      </p>
      <div id="stOptTransitionsList" style="display: flex; flex-direction: column; gap: 8px; max-height: 380px; overflow-y: auto;"></div>
    </div>

    <!-- Şelale Grafiği (İşlem Sırası ve Süreleri) -->
    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px;">
      <h3 style="margin: 0 0 4px 0; font-size: 13px;">🔄 İşlem Sıralaması ve Şelale Grafiği (Execution Waterfall)</h3>
      <p style="margin: 0 0 8px 0; font-size: 11px; opacity: 0.8;">
        Hangi anda hangi işler hangi sırayla birbirini takip ediyor ve kaç mikrosaniye sürüyor:
      </p>
      <div style="display: flex; gap: 12px; font-size: 11px; margin-bottom: 8px; flex-wrap: wrap;">
        <span><strong style="color: #3b82f6;">■</strong> Zaman Çizelgesi</span>
        <span><strong style="color: #a855f7;">■</strong> Animasyon/Stil</span>
        <span><strong style="color: #f97316;">■</strong> DOM Döngüsü</span>
        <span><strong style="color: #ef4444;">■</strong> Düzen (Reflow)</span>
        <span><strong style="color: #06b6d4;">■</strong> SVG Filtre</span>
        <span><strong style="color: #10b981;">■</strong> Kompozit</span>
      </div>
      <div id="stOptWaterfallList" style="display: flex; flex-direction: column; gap: 4px; max-height: 420px; overflow-y: auto; font-family: monospace; font-size: 11px;"></div>
    </div>
  </div>

  <!-- Eski Kare Birleştirme Aracı (Legacy \move / \t Compressor) -->
  <details style="margin-top: 14px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
    <summary><span data-i18n="st.opt"></span></summary>
    <p class="hint" data-i18n="st.optHint"></p>
    <div class="row">
      <label class="fld"><span data-i18n="st.optFps"></span><select id="stOptLegacyFps"><option>23.976</option><option selected>24</option><option>25</option><option>29.97</option><option>30</option><option>50</option><option>59.94</option><option>60</option></select></label>
      <label class="fld"><span data-i18n="st.optMode"></span>
        <select id="stOptLegacyMode"><option value="invisible" data-i18n="st.optInvisible"></option><option value="exact" data-i18n="st.optExact"></option><option value="loose" data-i18n="st.optLoose"></option></select></label>
      <button type="button" class="btn sm primary" id="stOptLegacyRun" data-i18n="st.optRun"></button>
      <button type="button" class="btn sm" id="stOptLegacyCancel" data-i18n="st.cancel" hidden></button>
    </div>
    <p class="hint" id="stOptLegacyStatus" role="status"></p>
    <pre class="code" id="stOptLegacyOut" hidden></pre>
    <div class="row" id="stOptLegacyDone" hidden>
      <button type="button" class="btn sm primary" id="stOptLegacyAdd" data-i18n="st.optAdd"></button>
      <button type="button" class="btn sm" id="stOptLegacySave" data-i18n="st.optSave"></button>
      <button type="button" class="btn sm" id="stOptLegacyCopy" data-i18n="st.optCopy"></button>
    </div>
  </details>
</details>`;

interface Deps {
  session: () => StudioSession | null;
  add?: (files: File[], select: boolean) => Promise<void>;
  videoFps: () => number | null;
  status?: (msg: string) => void;
}

export const initOptimize = ({ session, add, videoFps }: Deps) => {
  const assInput = $<HTMLTextAreaElement>('stOptAssInput');
  const startInput = $<HTMLInputElement>('stOptStartSec');
  const endInput = $<HTMLInputElement>('stOptEndSec');
  const fpsSelect = $<HTMLSelectElement>('stOptFps');
  const runBtn = $<HTMLButtonElement>('stOptRun');
  const statusEl = $('stOptStatus');
  const resultsBox = $('stOptResults');

  const say = (msg: string, isErr = false): void => {
    statusEl.textContent = msg;
    statusEl.style.color = isErr ? '#ef4444' : '#10b981';
  };

  const syncVideoFps = (): void => {
    const v = videoFps();
    if (v !== null) {
      const match = [...fpsSelect.options].find((o) => Math.abs(Number(o.value) - v) < 0.1);
      if (match) fpsSelect.value = match.value;
      const legacyOpt = [...$<HTMLSelectElement>('stOptLegacyFps').options].find((o) => Math.abs(Number(o.value) - v) < 0.1);
      if (legacyOpt) $<HTMLSelectElement>('stOptLegacyFps').value = legacyOpt.value;
    }
  };
  const fold = $('stOptimize');
  fold.addEventListener('toggle', syncVideoFps);
  // Opened via microtask, not a parser `open` attribute: setting `open` during init makes jsdom queue a toggle task (setImmediate) that outlives the init turn (see monitor.ts).
  queueMicrotask(() => { (fold as HTMLDetailsElement).open = true; });

  // Oynatıcıdaki altyazıyı çek
  $('stOptLoadCurrent').addEventListener('click', async () => {
    const s = session();
    if (!s) { say('Oynatıcıda yüklü altyazı yok.', true); return; }
    say('Altyazı yükleniyor...');
    const text = await s.blob.text();
    assInput.value = text;
    say(`Altyazı başarıyla çekildi: ${s.name} (${(text.length / 1024).toFixed(1)} KB)`);
  });

  // Re:Zero hazır örneği
  $('stOptLoadReZero').addEventListener('click', async () => {
    say('Re:Zero altyazısı yükleniyor...');
    try {
      const res = await fetch('/rezero_sample.ass');
      if (!res.ok) throw new Error('Dosya bulunamadı');
      assInput.value = await res.text();
      startInput.value = '1320';
      endInput.value = '1335';
      say('Re:Zero altyazısı yüklendi. Yoğun başlık ve klip geçişi aralığı (1320-1335s) ayarlandı.');
    } catch {
      assInput.value = `[Script Info]\nTitle: Re:Zero Sample\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,66,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3.9,0,2,60,60,69,1\nStyle: sign_Arial,Arial,75,&H29253B&,&H000000FF,&H38334B&,&H00000000,0,0,0,0,100,100,0,0,1,4,0,8,60,60,69,0\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:22:02.55,0:22:06.17,sign_Arial,,0,0,0,,{\\an8\\c&H29253B&\\3c&H38334B&\\bord4\\be45\\shad0\\fs75\\frz31.47\\pos(888,394.67)}Natsuki Subaru Buradaydı\nDialogue: 0,0:22:06.93,0:22:09.98,Default,,0,0,0,,{\\an2\\pos(960,1011)\\fscx100\\fscy100\\frz0\\p1\\c&H000000&}m -1.34 66.33 l 1900 66.33 1900 1132.99 -1.34 1132.99\nDialogue: 0,0:22:06.93,0:22:09.98,Default,,0,0,0,,{\\bord0\\shad0\\fs250\\an5\\b0\\c&H1A1BC5&\\pos(960,540)\\t(0,1200,\\fscx98\\fscy98)}Artakalan\nDialogue: 0,0:22:06.93,0:22:09.98,Default,,0,0,0,,{\\bord0\\shad0\\fs250\\an5\\b0\\c&H000000&\\t(0,1200,\\fscx98\\fscy98)\\frz84.12\\move(1284.67,586.66,1278.17,585.72,0,1200)\\clip(m 1183 550 l 1275 548 1274 648 1183 651)}b\n`;
      startInput.value = '1320';
      endInput.value = '1335';
      say('Re:Zero şablonu yüklendi (1320-1335s).');
    }
  });

  // Yomi no Tsugai hazır örneği
  $('stOptLoadYomi').addEventListener('click', () => {
    assInput.value = `[Script Info]\nTitle: Yomi no Tsugai Ending\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,0,2,30,30,30,1\nStyle: ED - Hun,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,30,30,40,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:21:30.40,0:21:33.06,ED - Hun,,0,0,0,,{\\blur60\\t(0,350,\\blur6)}Kabaran pislik bataklığında eriyen ruhlar birer birer kayboluyor...\nDialogue: 1,0:21:30.40,0:21:33.06,ED - Hun,,0,0,0,,{\\blur30\\t(0,350,\\blur2)}Kabaran pislik bataklığında eriyen ruhlar birer birer kayboluyor...\nDialogue: 2,0:21:30.40,0:21:33.06,ED - Hun,,0,0,0,,{\\blur10\\t(0,350,\\blur0.5)}Kabaran pislik bataklığında eriyen ruhlar birer birer kayboluyor...\nDialogue: 0,0:21:33.10,0:21:36.50,ED - Hun,,0,0,0,,{\\blur60\\t(0,350,\\blur6)}Sonsuz karanlıkta parlayan küçük bir ışık huzmesi arıyorum...\n`;
    startInput.value = '1290';
    endInput.value = '1300';
    say('Yomi no Tsugai Ending örneği yüklendi (1290-1300s). 3 katmanlı animasyonlu \\blur60 hazır.');
  });

  // Hızlı zaman aralıkları
  $('stOptQuickAll').addEventListener('click', () => { startInput.value = '0'; endInput.value = '3600'; });
  $('stOptQuickIntro').addEventListener('click', () => { startInput.value = '0'; endInput.value = '10'; });
  $('stOptQuickEnding').addEventListener('click', () => { startInput.value = '1320'; endInput.value = '1335'; });

  // Analiz Çalıştırma
  runBtn.addEventListener('click', () => {
    const text = assInput.value.trim();
    if (!text) { say('Lütfen geçerli bir ASS altyazı metni yapıştırın veya yükleyin.', true); return; }

    const startSec = Math.max(0, parseFloat(startInput.value) || 0);
    const endSec = Math.max(startSec + 0.5, parseFloat(endInput.value) || 10);
    const fps = parseInt(fpsSelect.value, 10) || 24;

    say('Hesaplanıyor... Kareler taranıyor ve adli analiz yapılıyor...');
    runBtn.disabled = true;

    window.setTimeout(() => {
      try {
        const result = runForensicAnalysis({ text, startSec, endSec, fps });
        renderResults(result);
        say(`Analiz tamamlandı: ${result.summary.analyzedFrames} kare incelendi (${startSec.toFixed(1)}s - ${endSec.toFixed(1)}s).`);
      } catch (err) {
        say(`Analiz hatası: ${(err as Error).message}`, true);
      } finally {
        runBtn.disabled = false;
      }
    }, 20);
  });

  const renderResults = (res: ForensicResult): void => {
    resultsBox.hidden = false;

    // Kazançlar
    const g = res.optimizationsGain;
    $('stOptBlurGains').textContent = `${g.svgBlurSavedMutations} mutasyon elendi (%${g.svgBlurSavedPercent} tasarruf)`;
    $('stOptTimelineGains').textContent = `${g.timelineSavedUs} µs CPU tasarrufu (Memoized)`;
    $('stOptSpikeGains').textContent = `Tepe: ${g.maxFrameSpikeBeforeMs}ms ➔ ${g.maxFrameSpikeAfterMs}ms`;

    // Mimari Grid
    const s = res.summary;
    const arch = $('stOptArchGrid');
    arch.innerHTML = `
      <div style="background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px;">Toplam Event: <strong>${s.totalEvents}</strong></div>
      <div style="background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px;">DOM Yönlenen: <strong style="color: #f97316;">${s.domLinesCount}</strong></div>
      <div style="background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px;">Canvas Yönlenen: <strong style="color: #10b981;">${s.canvasLinesCount}</strong></div>
      <div style="background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px;">Unpositioned (Reflow Riski): <strong style="color: #ef4444;">${s.unpositionedLinesCount}</strong></div>
      <div style="background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px;">SVG Blur Satırları: <strong>${s.blurLinesCount}</strong></div>
      <div style="background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px;">Klip Satırları (\\clip): <strong>${s.clipLinesCount}</strong></div>
      <div style="background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px;">Vektörel Çizim (\\p1): <strong>${s.drawingLinesCount}</strong></div>
    `;

    // Hotspots
    const hBox = $('stOptHotspotsBox');
    const hList = $('stOptHotspotsList');
    if (res.hotspots.length === 0) {
      hBox.style.display = 'none';
    } else {
      hBox.style.display = 'block';
      hList.innerHTML = res.hotspots.slice(0, 5).map((h) => `
        <div style="background: rgba(0,0,0,0.25); border-left: 3px solid ${h.severity === 'critical' ? '#ef4444' : '#f59e0b'}; padding: 6px 8px; border-radius: 3px;">
          <div style="font-weight: bold; color: ${h.severity === 'critical' ? '#ef4444' : '#f59e0b'};">${h.title}</div>
          <div style="opacity: 0.85; margin-top: 2px;">${h.description}</div>
          <div style="opacity: 0.7; font-size: 11px; margin-top: 2px;">Etki: ${h.impact}</div>
        </div>
      `).join('');
    }

    // Transitions (Satır Değişimi Anlarında Adli İnceleme)
    const tList = $('stOptTransitionsList');
    if (res.transitions.length === 0) {
      tList.innerHTML = '<div style="opacity: 0.7;">Bu zaman aralığında satır geçişi bulunamadı.</div>';
    } else {
      tList.innerHTML = res.transitions.map((tr) => `
        <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="color: #3b82f6; font-size: 12px;">📍 ${tr.timeSec.toFixed(3)}s — ${tr.reason}</strong>
            <span style="font-size: 11px; padding: 2px 6px; border-radius: 3px; background: ${tr.at.forcedReflow ? 'rgba(239, 68, 68, 0.2); color: #ef4444' : 'rgba(16, 185, 129, 0.2); color: #10b981'};">
              ${tr.at.forcedReflow ? '⚠️ FORCED REFLOW RİSKİ' : '✓ Normal Geçiş'}
            </span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 6px; font-size: 11px; text-align: center;">
            <div style="background: rgba(255,255,255,0.03); padding: 4px; border-radius: 4px;">
              <div style="opacity: 0.7;">ÖNCESİ (-16ms)</div>
              <div>Aktif: <strong>${tr.before.activeLines}</strong></div>
              <div>Maliyet: <strong>~${tr.before.estimatedCostMs}ms</strong></div>
            </div>
            <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); padding: 4px; border-radius: 4px;">
              <div style="color: #60a5fa; font-weight: bold;">TAM GEÇİŞ ANI (0ms)</div>
              <div>Mutasyon: <strong>${tr.at.domMutations} DOM, ${tr.at.filterMutations} SVG</strong></div>
              <div>Tepe Yük: <strong style="color: ${tr.at.estimatedCostMs > 16 ? '#ef4444' : '#10b981'};">~${tr.at.estimatedCostMs}ms</strong></div>
            </div>
            <div style="background: rgba(255,255,255,0.03); padding: 4px; border-radius: 4px;">
              <div style="opacity: 0.7;">SONRASI (+16ms)</div>
              <div>Aktif: <strong>${tr.after.activeLines}</strong></div>
              <div>Maliyet: <strong>~${tr.after.estimatedCostMs}ms</strong></div>
            </div>
          </div>
          <div style="margin-top: 6px; font-size: 10px; opacity: 0.75;">
            <strong>Adli Tespitler:</strong> ${tr.at.causes.join(' • ')}
          </div>
        </div>
      `).join('');
    }

    // Waterfall Listesi
    const wList = $('stOptWaterfallList');
    wList.innerHTML = res.frames.slice(0, 60).map((f) => {
      const ms = (f.totalUs / 1000).toFixed(2);
      const isWarn = f.totalUs > 16000;
      return `
        <div style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.15); padding: 3px 6px; border-radius: 3px;">
          <span style="width: 55px; opacity: 0.75;">${f.timeSec.toFixed(3)}s</span>
          <div style="flex: 1; display: flex; height: 10px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden;">
            ${f.steps.map((st) => {
              const colors: Record<string, string> = {
                timeline: '#3b82f6',
                eval: '#a855f7',
                dom: '#f97316',
                layout: '#ef4444',
                filter: '#06b6d4',
                composite: '#10b981',
              };
              const pct = f.totalUs > 0 ? (st.durationUs / f.totalUs) * 100 : 0;
              return `<div style="width: ${pct}%; background: ${colors[st.category] || '#fff'};" title="${st.name}: ${st.durationUs}µs (${st.desc})"></div>`;
            }).join('')}
          </div>
          <span style="width: 55px; text-align: right; font-weight: bold; color: ${isWarn ? '#ef4444' : '#10b981'};">${ms}ms</span>
          <span style="width: 45px; opacity: 0.6; font-size: 10px;">${f.activeLines} satır</span>
        </div>
      `;
    }).join('');
  };

  // --- Eski Kare Birleştirme Aracı Mantığı (Legacy Optimizer Support) ---
  const legacyRun = $<HTMLButtonElement>('stOptLegacyRun');
  const legacyCancel = $<HTMLButtonElement>('stOptLegacyCancel');
  const legacySay = (msg: string): void => { $('stOptLegacyStatus').textContent = msg; };
  const legacyOut = $('stOptLegacyOut');
  const legacyDone = $('stOptLegacyDone');
  const legacyFpsSel = $<HTMLSelectElement>('stOptLegacyFps');
  let worker: Worker | null = null;
  let seq = 0;
  let result: { name: string; text: string } | null = null;

  const post = (m: ToOptimizeWorker): void => { (worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })).postMessage(m); };

  legacyRun.addEventListener('click', async () => {
    const s = session();
    if (!s) { legacySay(t('st.optNoSub')); return; }
    if (s.kind !== 'ass') { legacySay(t('st.optNotAss')); return; }
    if (s.blob.size > MAX_OPTIMIZE_BYTES) { legacySay(t('st.optBig', { size: humanBytes(s.blob.size) })); return; }
    const id = ++seq;
    legacyRun.hidden = true; legacyCancel.hidden = false; legacyDone.hidden = true; legacyOut.hidden = true; result = null;
    legacySay(t('st.optReading'));
    const text = await s.blob.text();
    if (id !== seq) return;
    const w = (worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
    const onMsg = (e: MessageEvent<FromOptimizeWorker>): void => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.op === 'progress') { legacySay(t('st.optRunning', { pct: Math.round(m.fraction * 100) })); return; }
      w.removeEventListener('message', onMsg);
      legacyRun.hidden = false; legacyCancel.hidden = true;
      if (m.op === 'error') { legacySay(m.aborted ? t('st.cancelled') : t('st.fail', { error: m.message })); return; }
      const st = m.stats;
      const pct = st.eventsIn ? ((1 - st.eventsOut / st.eventsIn) * 100).toFixed(1) : '0';
      result = { name: optimizedName(s.name), text: m.text };
      legacyOut.textContent = t('st.optResult', { a: st.eventsIn.toLocaleString('en-US'), b: st.eventsOut.toLocaleString('en-US'), pct, size0: humanBytes(text.length), size1: humanBytes(m.text.length), chains: st.chains, merged: st.merged, rej: st.rejected, ord: st.orderConflicts, err: Math.round(st.worstError * 100), s: (m.ms / 1000).toFixed(1) });
      legacyOut.hidden = false;
      legacyDone.hidden = st.merged === 0;
      legacySay(st.merged === 0 ? t('st.optNothing') : t('st.optDone'));
    };
    w.addEventListener('message', onMsg);
    post({ op: 'run', id, text, fps: Number(legacyFpsSel.value), mode: $<HTMLSelectElement>('stOptLegacyMode').value as 'exact' });
    legacyCancel.onclick = () => { post({ op: 'cancel', id }); };
  });

  $('stOptLegacyAdd').addEventListener('click', () => { if (result && add) void add([new File([result.text], result.name, { type: 'text/plain' })], true); });
  $('stOptLegacySave').addEventListener('click', () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.text], { type: 'text/plain' }));
    Object.assign(document.createElement('a'), { href: url, download: result.name }).click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('stOptLegacyCopy').addEventListener('click', async () => { if (legacyOut.textContent) legacySay((await copyText(legacyOut.textContent)) ? t('st.perfCopied') : t('st.perfCopyFail')); });

  return { sync: syncVideoFps };
};
