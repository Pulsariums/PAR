import type { AnalyzeReport } from './types';

const n = (v: number): string => Math.round(v).toLocaleString('en-US');
const t = (s: number): string => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const pct = (v: number): string => `${(v * 100).toFixed(1)} %`;

/** Compact text summary of a report (what the CLI prints and the Studio panel shows). */
export const summaryText = (r: AnalyzeReport, top = 8): string => {
  const { input: i, sprites: s, canvas: c } = r;
  const out: string[] = [];
  out.push(`${n(i.events)} events, ${t(i.durationS)}, layout ${i.layout[0]}x${i.layout[1]}, ${i.fps} fps, sprite scale ${i.scale}`);
  out.push(`peak: ${n(r.peak.visible)} lines visible at ${t(r.peak.at)}; ${r.bursts.length} bursts (jumps of lines)`);
  const reasons = Object.entries(c.reasons).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${n(v)}`).join(', ');
  out.push(`canvas path: ${n(c.events)} events qualify (${pct(c.share)}; ${pct(c.lineSecondsShare)} of line time)${reasons ? `; not: ${reasons}` : ''}`);
  out.push(`sprites: ${n(s.distinct)} distinct keys (${n(s.masks)} shared glyph masks), ${n(s.requests)} lookups, est. build ${(s.buildMs / 1000).toFixed(1)} s (${s.msPerSprite} ms each), est. ${n(s.megabytes)} MB if all kept${s.keysCapped ? ' [key table capped]' : ''}`);
  const worst = r.bursts.slice().sort((a, b) => b.buildMs - a.buildMs).slice(0, top).sort((a, b) => a.at - b.at);
  if (worst.length) out.push('costliest bursts (time, lines before -> peak, new sprites, est. build ms):');
  for (const b of worst) out.push(`  ${t(b.at)}  ${n(b.before)} -> ${n(b.peak)}  ${n(b.newKeys)} new  ~${n(b.buildMs)} ms`);
  out.push(`seconds with new sprites: ${r.seconds.filter((x) => x.newKeys > 0).length} of ${r.seconds.length}; busiest second needs ${n(r.seconds.reduce((m, x) => Math.max(m, x.keys), 0))} keys`);
  out.push(r.chains ? `frame-by-frame runs: ${n(r.chains.chains)} chains, ${n(r.chains.events)} events, ${n(r.chains.saveable)} fewer if merged (par optimize)` : 'frame-by-frame runs: not measured (needs the ASS text)');
  const st = r.styles;
  out.push(`styles: ${n(st.defined)} defined, ${st.unused.length} unused${st.unused.length ? ` (${st.unused.slice(0, 6).join(', ')}${st.unused.length > 6 ? ', ...' : ''})` : ''}; fonts used: ${st.fonts.slice(0, 5).map((f) => `${f.family} ${n(f.events)}`).join(', ')}${st.unusedFonts.length ? `; unused fonts: ${st.unusedFonts.join(', ')}` : ''}`);
  return out.join('\n');
};
