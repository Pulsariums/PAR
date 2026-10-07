type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const current = (): Element | null => document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;

/**
 * Fullscreen of the stage itself (so the subtitles and the controls stay on the picture). Where the browser cannot fullscreen an
 * element (iPhone), the stage fills the window instead (`.fake-fs`).
 */
export const toggleFullscreen = async (box: HTMLElement): Promise<void> => {
  const el = box as FsEl;
  if (box.classList.contains('fake-fs')) { box.classList.remove('fake-fs'); box.dispatchEvent(new Event('fschange')); return; }
  if (current() === box) { await (document.exitFullscreen?.() ?? (document as FsDoc).webkitExitFullscreen?.()); return; }
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else throw new Error('no fullscreen');
  } catch {
    box.classList.add('fake-fs');
    box.dispatchEvent(new Event('fschange'));
  }
};

export const onFullscreen = (box: HTMLElement, fn: (on: boolean) => void): void => {
  const sync = (): void => fn(current() === box || box.classList.contains('fake-fs'));
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  box.addEventListener('fschange', sync);
};
