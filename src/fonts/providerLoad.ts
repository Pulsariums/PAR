import { inflate, type Inflater } from './bytes';
import { readInputs } from './input';
import { parseFont, type ParsedFace } from './loader';
import type { FontProvider, FontSource } from './provider';
import { normalizeName, wantedWeight } from './resolver';

/** A used family and the (bold, italic) requests made of it. */
export interface ProviderNeed {
  name: string;
  looks: ReadonlyMap<string, { b: number; i: boolean }>;
}

export interface ProviderJob {
  providers: readonly FontProvider[];
  /** Per-call limit; a provider that does not answer in time counts as "not found" (and is reported in `warn`). */
  timeoutMs: number;
  /** True when a user / embedded face (or a `fontMap` entry, or a non-synthetic provider face) already serves the request. */
  covered(name: string, b: number, i: boolean): boolean;
  /** Takes the parsed faces of one provider answer (registers them, or only collects them in preflight). */
  accept(faces: ParsedFace[], provider: FontProvider): Promise<void>;
  /** (provider, family, weight, italic) requests already made: never repeated while this set lives. */
  tried: Set<string>;
  warn(m: string): void;
  inf?: Inflater;
}

const guard = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what}: no answer within ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });

/** Parses a provider answer. The requested family becomes an alias when the file does not carry that name itself. */
export const parseProvided = async (src: FontSource, requested: string, inf: Inflater = inflate): Promise<ParsedFace[]> => {
  const key = normalizeName(requested);
  const out: ParsedFace[] = [];
  for (const file of await readInputs(src)) {
    for (const p of await parseFont(file, undefined, inf)) {
      const { families, fullNames } = p.info;
      if (![...families, ...fullNames].some((n) => n.toLowerCase() === key)) families.push(requested);
      out.push(p);
    }
  }
  return out;
};

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Asks the providers, in order, for every (family, look) not covered yet. First provider with an answer wins a look.
 * A failing, slow or corrupt provider only produces a warning. Returns provider name => families it supplied.
 */
export const fetchFromProviders = async (needs: Iterable<ProviderNeed>, job: ProviderJob, concurrency = 4): Promise<Record<string, string[]>> => {
  const hits: Record<string, string[]> = {};
  const tasks: Array<{ name: string; b: number; i: boolean }> = [];
  for (const n of needs) for (const l of n.looks.values()) tasks.push({ name: n.name, b: l.b, i: l.i });
  let next = 0;
  const run = async (): Promise<void> => {
    for (let t = tasks[next++]; t; t = tasks[next++]) {
      if (job.covered(t.name, t.b, t.i)) continue;
      const req = { weight: wantedWeight(t.b), italic: t.i };
      for (const p of job.providers) {
        const key = `${p.name}\0${normalizeName(t.name)}\0${req.weight}\0${req.italic}`;
        if (job.tried.has(key)) continue;
        job.tried.add(key);
        const what = `font provider "${p.name}" for "${t.name}"`;
        try {
          if (p.has && !(await guard(p.has(t.name), job.timeoutMs, what))) continue;
          const src = await guard(p.get(t.name, req), job.timeoutMs, what);
          if (src === null || src === undefined) continue;
          await job.accept(await parseProvided(src, t.name, job.inf), p);
          (hits[p.name] ??= []).includes(t.name) || hits[p.name].push(t.name);
          break;
        } catch (e) {
          job.warn(`${what}: ${errText(e)}`);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, run));
  return hits;
};
