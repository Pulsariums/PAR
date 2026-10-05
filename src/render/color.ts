/** 0xBBGGRR + ASS alpha (0 opaque .. 255 transparent) => CSS rgba(). */
export const cssColor = (bgr: number, alpha: number): string => {
  const r = bgr & 0xff;
  const g = (bgr >> 8) & 0xff;
  const b = (bgr >> 16) & 0xff;
  const a = Math.round((1 - Math.min(255, Math.max(0, alpha)) / 255) * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
