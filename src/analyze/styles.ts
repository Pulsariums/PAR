import type { AssEvent, AssStyle, StateOp } from '../types/script';

/** Which styles and font families the events use: the line style, `\r<style>` resets and `\fn` overrides. */
export class Usage {
  private readonly styles = new Map<string, number>();
  private readonly fonts = new Map<string, number>();

  add(ev: AssEvent, style: AssStyle): void {
    this.styles.set(ev.style, (this.styles.get(ev.style) ?? 0) + 1);
    const seen = new Set<string>([style.fontName]);
    const walk = (ops: readonly StateOp[]): void => {
      for (const o of ops) {
        if (o.type === 't') walk(o.ops);
        else if (o.type === 'r' && o.style) this.styles.set(o.style, (this.styles.get(o.style) ?? 0) + 1);
        else if (o.type === 'set' && o.key === 'fn' && typeof o.value === 'string') seen.add(o.value);
      }
    };
    for (const f of ev.fragments) walk(f.ops);
    for (const f of seen) this.fonts.set(f, (this.fonts.get(f) ?? 0) + 1);
  }

  summary(styles: Map<string, AssStyle>): { defined: number; unused: string[]; fonts: Array<{ family: string; events: number }>; unusedFonts: string[] } {
    const unused = [...styles.keys()].filter((n) => !this.styles.has(n));
    const fonts = [...this.fonts].map(([family, events]) => ({ family, events })).sort((a, b) => b.events - a.events);
    const definedFonts = new Set([...styles.values()].map((s) => s.fontName));
    return { defined: styles.size, unused, fonts, unusedFonts: [...definedFonts].filter((f) => !this.fonts.has(f)) };
  }
}
