/** Font files (and zips of fonts) the Fonts tab takes. */
export const FONT_FILE = /\.(ttf|otf|ttc|otc|woff2?|zip)$/i;

/** Drop fonts, a video or an .ass/.ssa file anywhere on the playground section. Several dropped fonts load together. */
export const initDrop = (zone: HTMLElement, onVideo: (f: File) => void, onSub: (f: File) => void, onFonts: (f: File[]) => void): void => {
  const isFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
  zone.addEventListener('dragover', (e) => {
    if (!isFiles(e)) return;
    e.preventDefault();
    zone.classList.add('dragging');
  });
  zone.addEventListener('dragleave', (e) => {
    if (!zone.contains(e.relatedTarget as Node | null)) zone.classList.remove('dragging');
  });
  zone.addEventListener('drop', (e) => {
    zone.classList.remove('dragging');
    const all = Array.from(e.dataTransfer?.files ?? []);
    const file = all[0];
    if (!file) return;
    e.preventDefault();
    const fonts = all.filter((f) => FONT_FILE.test(f.name));
    if (fonts.length) { onFonts(fonts); return; }
    if (/\.(ass|ssa|txt)$/i.test(file.name)) onSub(file);
    else if (file.type.startsWith('video/') || /\.(mp4|webm|mkv|mov|ogv|m4v)$/i.test(file.name)) onVideo(file);
  });
};
