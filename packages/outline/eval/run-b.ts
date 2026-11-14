import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { DEFAULT_TUNING, type Tuning } from '../src/constants.js';
import { readCache } from './embedder.js';
import { evaluate, VARIANTS, type Tally } from './evaluate.js';
import { AMI_TUNED } from './tuned.js';

/**
 * Level B experiment. Usage: tsx eval/run-b.ts [amiAnnotationDir] [outFile]
 * Needs the vector cache from eval/embed-cache.ts. Tunes the A/B weight (and the Not placed
 * thresholds that depend on it) on even-numbered meetings; reports on the odd-numbered ones.
 */
const dir = process.argv[2] ?? `${process.env.HOME}/scrb-dev-assets/downloads/ami/ann`;
const outFile = process.argv[3] ?? '/dev/null';
const even = (p: number): boolean => p % 2 === 0;
const odd = (p: number): boolean => p % 2 === 1;
const cache = readCache();
const vec = (t: string): Float32Array => {
  const v = cache.get(t);
  if (!v) throw new Error(`missing vector (run eval/embed-cache.ts): ${t.slice(0, 40)}`);
  return v;
};

const objective = (t: Partial<Tuning>, only: (p: number) => boolean, withVec: boolean): number => {
  const { results } = evaluate(dir, t, only, withVec ? vec : undefined);
  let sum = 0;
  for (const v of VARIANTS) {
    const r = results.get(`${v}|all`)!;
    sum += r.correct / r.ms;
  }
  return sum / VARIANTS.length;
};

const GRID: { [K in keyof Tuning]?: number[] } = {
  semanticWeight: [0.3, 0.5, 0.7, 0.85, 1],
  cosineFloor: [0, 0.1, 0.2, 0.3, 0.4],
  notPlacedScore: [0, 0.02, 0.05, 0.1, 0.2],
  costNext: [0, 0.02, 0.05, 0.12],
  costNotPlacedEnter: [0.15, 0.4, 0.8],
  costNotPlacedLeave: [0.15, 0.4, 0.8],
};

function tune(base: Partial<Tuning>, log: string[], label: string): Partial<Tuning> {
  let best: Partial<Tuning> = { ...base, semanticWeight: 0.5 };
  let bestScore = objective(best, even, true);
  log.push(`${label}: start (weight 0.5) tuning-half ${bestScore.toFixed(4)}`);
  for (let round = 0; round < 2; round += 1)
    for (const [key, values] of Object.entries(GRID) as [keyof Tuning, number[]][])
      for (const v of values) {
        const c = { ...best, [key]: v };
        const s = objective(c, even, true);
        if (s > bestScore + 1e-6) {
          best = c;
          bestScore = s;
          log.push(`  ${key}=${v} -> ${s.toFixed(4)}`);
        }
      }
  return best;
}

const pct = (a: number, b: number): string => (b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(1)}%`);
function table(
  name: string,
  t: Partial<Tuning>,
  withVec: boolean,
  only: (p: number) => boolean,
): string[] {
  const t0 = performance.now();
  const { results, used } = evaluate(dir, t, only, withVec ? vec : undefined);
  const ms = performance.now() - t0;
  const out = [`### ${name} (${used} meetings, matcher time ${(ms / 1000).toFixed(1)} s)`, ''];
  out.push(
    '| Variant | Correct | Correct where a heading exists | Likely precision | Likely share | Unsure share | Not placed share |',
  );
  out.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  const rows: Tally[] = [];
  for (const v of VARIANTS) {
    const r = results.get(`${v}|all`)!;
    rows.push(r);
    out.push(
      `| ${v} | ${pct(r.correct, r.ms)} | ${pct(r.inOutlineCorrect, r.inOutlineMs)} | ${pct(r.likelyCorrect, r.likelyMs)} | ${pct(r.likelyMs, r.ms)} | ${pct(r.unsureMs, r.ms)} | ${pct(r.notPlacedMs, r.ms)} |`,
    );
  }
  const sum = (f: (r: Tally) => number): number => rows.reduce((a, r) => a + f(r), 0);
  out.push(
    `| **all variants** | ${pct(
      sum((r) => r.correct),
      sum((r) => r.ms),
    )} | ${pct(
      sum((r) => r.inOutlineCorrect),
      sum((r) => r.inOutlineMs),
    )} | ${pct(
      sum((r) => r.likelyCorrect),
      sum((r) => r.likelyMs),
    )} | ${pct(
      sum((r) => r.likelyMs),
      sum((r) => r.ms),
    )} | ${pct(
      sum((r) => r.unsureMs),
      sum((r) => r.ms),
    )} | ${pct(
      sum((r) => r.notPlacedMs),
      sum((r) => r.ms),
    )} |`,
    '',
  );
  return out;
}

const log: string[] = [];
const bestFromDefaults = tune({}, log, 'A defaults + B');
const bestFromTuned = tune(AMI_TUNED, log, 'A tuned + B');
const lines: string[] = ['# Level B raw run', '', '```', ...log, '```', ''];
lines.push('Best (defaults base):', '```', JSON.stringify(bestFromDefaults), '```');
lines.push('Best (tuned base):', '```', JSON.stringify(bestFromTuned), '```', '');
const configs: [string, Partial<Tuning>, boolean][] = [
  ['Level A, package defaults', {}, false],
  ['Level A, AMI-tuned', AMI_TUNED, false],
  ['Level B only (weight 1), defaults', { ...DEFAULT_TUNING, semanticWeight: 1 }, true],
  ['Level A+B, defaults base, tuned weights', bestFromDefaults, true],
  ['Level A+B, AMI-tuned base, tuned weights', bestFromTuned, true],
];
for (const [half, fn] of [
  ['HELD-OUT half (odd meetings)', odd],
  ['tuning half (even meetings)', even],
] as const)
  for (const [name, t, v] of configs) lines.push(...table(`${half}: ${name}`, t, v, fn));
writeFileSync(outFile, lines.join('\n'));
console.log(lines.join('\n'));
