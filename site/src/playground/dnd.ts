/** Drop a video or an .ass/.ssa file anywhere on the playground section. */
export const initDrop = (zone: HTMLElement, onVideo: (f: File) => void, onSub: (f: File) => void): void => {
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
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    e.preventDefault();
    if (/\.(ass|ssa|txt)$/i.test(file.name)) onSub(file);
    else if (file.type.startsWith('video/') || /\.(mp4|webm|mkv|mov|ogv|m4v)$/i.test(file.name)) onVideo(file);
  });
};
