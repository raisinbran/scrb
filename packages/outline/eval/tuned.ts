import type { Tuning } from '../src/constants.js';

/**
 * Values found by eval/tune.ts on the even-numbered AMI meetings. They raise AMI accuracy by
 * placing almost everything under the order prior, which gives up the plan's behaviours of
 * refusing weak matches (Not placed) and jumping back, so they are NOT the package defaults.
 */
export const AMI_TUNED: Partial<Tuning> = {
  costNext: 0.02,
  costSkipPerItem: 0,
  costBack: 0.8,
  costNotPlacedEnter: 0.8,
  costNotPlacedLeave: 0.4,
  notPlacedScore: 0.02,
  fullEvidenceTokens: 50,
  specificBonus: 0,
};
