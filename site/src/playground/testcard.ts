/** Procedural 16:9 test card. Pure function of time so seeking and pausing work without any video file. */

const BARS = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8'];

export const drawCard = (canvas: HTMLCanvasElement, t: number): void => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, `hsl(${(t * 18) % 360} 55% 24%)`);
  g.addColorStop(1, `hsl(${(t * 18 + 70) % 360} 60% 12%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 3; i++) {
    const x = W * (0.5 + 0.35 * Math.sin(t * 0.5 + i * 2.1));
    const y = H * (0.5 + 0.3 * Math.cos(t * 0.4 + i * 1.7));
    const r = ctx.createRadialGradient(x, y, 0, x, y, H * 0.35);
    r.addColorStop(0, `hsla(${(t * 30 + i * 90) % 360} 80% 60% / .35)`);
    r.addColorStop(1, 'transparent');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += W / 16) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y <= H; y += H / 9) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  const bar = H * 0.06;
  BARS.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect((i * W) / 7, 0, W / 7 + 1, bar); });
  const sq = H / 18;
  for (let i = 0; i * sq < W; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#f4f4f4' : '#101010';
      ctx.fillRect(i * sq, H * 0.62 + j * sq, sq, sq);
    }
  }
  const sweep = (t * W * 0.08) % W;
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillRect(sweep, bar, 3, H - bar);
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.beginPath();
  ctx.moveTo(W / 2 - 12, H / 2); ctx.lineTo(W / 2 + 12, H / 2);
  ctx.moveTo(W / 2, H / 2 - 12); ctx.lineTo(W / 2, H / 2 + 12);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.font = `600 ${Math.round(H * 0.04)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(`TEST CARD 16:9  ${t.toFixed(2)} s`, 12, bar + H * 0.06);
};
