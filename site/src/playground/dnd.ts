/** Font files (and zips of fonts) the Fonts tab takes. */
export const FONT_FILE = /\.(ttf|otf|ttc|otc|woff2?|zip)$/i;
const VIDEO_FILE = /\.(mp4|webm|mkv|mov|ogv|m4v)$/i;
const SUB_DEFAULT = /\.(ass|ssa|txt)$/i;

export const isVideoFile = (f: File): boolean => f.type.startsWith('video/') || VIDEO_FILE.test(f.name);

export interface Classified { fonts: File[]; subs: File[]; videos: File[] }

/** Splits dropped / picked files by kind (fonts win over everything else, like the playground always did). */
export const classifyFiles = (files: readonly File[], subFile: RegExp = SUB_DEFAULT): Classified => ({
  fonts: files.filter((f) => FONT_FILE.test(f.name)),
  subs: files.filter((f) => !FONT_FILE.test(f.name) && subFile.test(f.name)),
  videos: files.filter((f) => !FONT_FILE.test(f.name) && !subFile.test(f.name) && isVideoFile(f)),
});

/** File drag and drop on `zone`: dashed outline while dragging, `onFiles` gets every dropped file. */
const watchDrop = (zone: HTMLElement, onFiles: (files: File[]) => void): void => {
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
    if (!all.length) return;
    e.preventDefault();
    onFiles(all);
  });
};

/** Drop fonts, a video or an .ass/.ssa file anywhere on the playground section. Several dropped fonts load together. */
export const initDrop = (zone: HTMLElement, onVideo: (f: File) => void, onSub: (f: File) => void, onFonts: (f: File[]) => void, subFile = SUB_DEFAULT): void => {
  watchDrop(zone, (all) => {
    const c = classifyFiles(all, subFile);
    if (c.fonts.length) { onFonts(c.fonts); return; }
    const first = all[0]!;
    if (subFile.test(first.name)) onSub(first);
    else if (isVideoFile(first)) onVideo(first);
  });
};

/** Like `initDrop`, but every dropped file is routed (a mixed drop of videos, subtitles and fonts works). */
export const initDropAll = (zone: HTMLElement, onFiles: (c: Classified) => void, subFile = SUB_DEFAULT): void => {
  watchDrop(zone, (all) => onFiles(classifyFiles(all, subFile)));
};
