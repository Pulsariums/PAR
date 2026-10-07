/** True when `ctx.filter = blur()` of this canvas implementation really spreads pixels (a `filter` property that is ignored would build sharp sprites). */
export const blurWorks = (make: (w: number, h: number) => OffscreenCanvas): boolean => {
  try {
    const src = make(16, 16);
    const a = src.getContext('2d');
    const dst = make(16, 16);
    const b = dst.getContext('2d');
    if (!a || !b || !('filter' in b)) return false;
    a.fillStyle = '#fff';
    a.fillRect(6, 6, 4, 4);
    b.filter = 'blur(2px)';
    b.drawImage(src, 0, 0);
    // Outside the square a blur leaves partial alpha; no blur leaves 0.
    return b.getImageData(4, 8, 1, 1).data[3] > 0;
  } catch { return false; }
};
