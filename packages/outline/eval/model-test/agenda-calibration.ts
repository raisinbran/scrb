import { adversarialSuite, generalSuite, split } from './suites.js';
import { generalBars, runAdversarial, runGeneral, trigramEmbedder } from './validate.js';

/**
 * Model-free diagnostic, not a replacement for the frozen scorer or a campaign decision.
 * From packages/outline: npx --no-install tsx eval/model-test/agenda-calibration.ts
 * Select on tuning cases only; evaluate the fixed candidate on held-out cases.
 */
async function main(): Promise<void> {
  const embed = trigramEmbedder();
  const g = split(generalSuite());
  const a = split(adversarialSuite());
  const candidates: { tau: number; wEmbed: number; recovered: number }[] = [];
  for (const wEmbed of [0.5, 0.65, 0.8, 1]) {
    for (let t = 30; t <= 90; t += 1) {
      const tau = t / 100;
      const adv = await runAdversarial(a.tuning, embed, tau, wEmbed);
      if (adv.num !== 0) continue;
      const gen = await runGeneral(g.tuning, embed, tau, wEmbed);
      if (
        gen.contradictionFalseCredit.num !== 0 ||
        gen.irrelevantFalseCredit.num !== 0 ||
        gen.duplicatesExactlyOnce.num !== gen.duplicatesExactlyOnce.den
      ) {
        continue;
      }
      candidates.push({ tau, wEmbed, recovered: gen.paraphraseRecall.num });
    }
  }
  candidates.sort((x, y) => y.recovered - x.recovered || y.tau - x.tau || x.wEmbed - y.wEmbed);
  const chosen = candidates[0];
  if (!chosen) {
    console.log(JSON.stringify({ status: 'INCONCLUSIVE', reason: 'no-safe-tuning-candidate' }));
    process.exitCode = 1;
    return;
  }

  // The historical MiniLM tau is not calibrated for trigrams; this is only a comparison.
  const baseline = {
    tau: 0.79,
    wEmbed: 0.5,
    general: await runGeneral(g.heldOut, embed, 0.79, 0.5),
    adversarial: await runAdversarial(a.heldOut, embed, 0.79, 0.5),
  };
  const tuning = {
    general: await runGeneral(g.tuning, embed, chosen.tau, chosen.wEmbed),
    adversarial: await runAdversarial(a.tuning, embed, chosen.tau, chosen.wEmbed),
  };
  const heldOut = {
    general: await runGeneral(g.heldOut, embed, chosen.tau, chosen.wEmbed),
    adversarial: await runAdversarial(a.heldOut, embed, chosen.tau, chosen.wEmbed),
  };
  const bars = generalBars(heldOut.general);
  const validated = bars.ok && tuning.adversarial.num === 0 && heldOut.adversarial.num === 0;
  console.log(
    JSON.stringify(
      {
        embedder: 'trigram-stand-in',
        tuningCandidates: candidates.length,
        chosen,
        baseline,
        tuning,
        heldOut,
        bars,
        status: validated ? 'SUITE_PASS_ONLY' : 'INCONCLUSIVE',
      },
      null,
      2,
    ),
  );
  // Even a suite pass cannot establish correctness of the missing historical claims.
  if (!validated) process.exitCode = 1;
}

void main().catch(() => {
  console.error('CALIBRATION_FAILED');
  process.exitCode = 1;
});
