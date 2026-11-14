import type { Tuning } from '../src/constants.js';
import { DEFAULT_TUNING } from '../src/constants.js';
import { evaluate, VARIANTS } from './evaluate.js';

/**
 * Usage: tsx eval/tune.ts [amiAnnotationDir]
 * Coordinate search on the even-numbered meetings only; the odd-numbered meetings stay held out.
 * Prints the best values and the accuracy of defaults and best on both halves.
 */
const dir = process.argv[2] ?? `${process.env.HOME}/scrb-dev-assets/downloads/ami/ann`;
const even = (p: number): boolean => p % 2 === 0;
const odd = (p: number): boolean => p % 2 === 1;

const GRID: { [K in keyof Tuning]?: number[] } = {
  notPlacedScore: [0, 0.02, 0.05, 0.1],
  costNext: [0, 0.01, 0.02, 0.05],
  costSkipPerItem: [0, 0.02, 0.05],
  costBack: [0.5, 0.8, 1.2, 2],
  costNotPlacedEnter: [0.15, 0.25, 0.4, 0.8],
  costNotPlacedLeave: [0.15, 0.25, 0.4, 0.8],
  fullEvidenceTokens: [30, 50, 80, 120, 200],
  parentWeight: [0.2, 0.4, 0.7, 1],
  specificBonus: [0, 0.05, 0.1, 0.2],
};

function objective(t: Partial<Tuning>, only: (p: number) => boolean): number {
  const { results } = evaluate(dir, t, only);
  let sum = 0;
  for (const v of VARIANTS) {
    const r = results.get(`${v}|all`)!;
    sum += r.correct / r.ms;
  }
  return sum / VARIANTS.length;
}

let best: Tuning = {
  ...DEFAULT_TUNING,
  ...(process.env.START ? JSON.parse(process.env.START) : {}),
};
let bestScore = objective(best, even);
console.log('defaults, tuning half:', bestScore.toFixed(4));
for (let round = 0; round < 2; round += 1) {
  for (const [key, values] of Object.entries(GRID) as [keyof Tuning, number[]][]) {
    for (const v of values) {
      const candidate = { ...best, [key]: v };
      const s = objective(candidate, even);
      if (s > bestScore + 1e-6) {
        best = candidate;
        bestScore = s;
        console.log(`  ${key}=${v} -> ${s.toFixed(4)}`);
      }
    }
  }
}
console.log('best:', JSON.stringify(best));
console.log(
  'tuning half  defaults/best:',
  objective(DEFAULT_TUNING, even).toFixed(4),
  objective(best, even).toFixed(4),
);
console.log(
  'held-out half defaults/best:',
  objective(DEFAULT_TUNING, odd).toFixed(4),
  objective(best, odd).toFixed(4),
);
