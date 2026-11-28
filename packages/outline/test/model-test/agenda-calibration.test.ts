import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { matchPoints, type Embed } from '../../eval/model-test/match.js';
import { adversarialSuite, type GeneralKind, type SuiteCase } from '../../eval/model-test/suites.js';
import { runAdversarial, runGeneral } from '../../eval/model-test/validate.js';

const ref = 'The board approved the budget.';
const gen = 'The board accepted the budget.';
const span = ref.split(/\s+/).map((text) => ({ text, speaker: 'Zed' }));
const points = [{ text: gen, cite: { first: 0, last: span.length - 1 } }];
const fixture: SuiteCase<GeneralKind> = {
  id: 'weight-paraphrase',
  kind: 'paraphrase',
  ref,
  gens: [gen],
  span,
};
const tau = 0.82;
// Cosine 0.9 and content-word F1 2/3 place the same supported claim on opposite sides of tau.
const embed: Embed = async (texts) =>
  texts.map((text) =>
    text === gen ? new Float32Array([1, 0]) : new Float32Array([0.9, Math.sqrt(0.19)]),
  );

describe('experimental matching weight', () => {
  it('keeps omitted weight equivalent to 0.5 and credits the supported pair at 0.8', async () => {
    const omitted = await matchPoints(points, [ref], span, embed, { tau });
    const frozen = await matchPoints(points, [ref], span, embed, { tau, wEmbed: 0.5 });
    const experimental = await matchPoints(points, [ref], span, embed, { tau, wEmbed: 0.8 });

    expect(omitted).toEqual(frozen);
    expect(frozen.status).toEqual(['extra']);
    expect(experimental.status).toEqual(['credited']);
    expect(experimental.genToRef).toEqual([0]);
    expect(experimental.sim[0]).toBeCloseTo(0.8 * 0.9 + 0.2 * (2 / 3));
  });

  it('forwards the nondefault weight through the general suite wrapper', async () => {
    const omitted = await runGeneral([fixture], embed, tau);
    expect(omitted).toEqual(await runGeneral([fixture], embed, tau, 0.5));
    expect(omitted.paraphraseRecall).toEqual({ num: 0, den: 1 });
    expect((await runGeneral([fixture], embed, tau, 0.8)).paraphraseRecall).toEqual({
      num: 1,
      den: 1,
    });
  });

  it.each([-0.1, 1.1, NaN, Infinity])(
    'rejects invalid weight %s before embedding in the matcher and both suite wrappers',
    async (wEmbed) => {
      const unusedEmbed = vi.fn(embed);
      await expect(
        matchPoints(points, [ref], span, unusedEmbed, { tau, wEmbed }),
      ).rejects.toThrow(RangeError);
      await expect(runGeneral([fixture], unusedEmbed, tau, wEmbed)).rejects.toThrow(RangeError);
      await expect(
        runAdversarial(adversarialSuite().slice(0, 1), unusedEmbed, tau, wEmbed),
      ).rejects.toThrow(RangeError);
      expect(unusedEmbed).not.toHaveBeenCalled();
    },
  );
});

describe('model-free calibration entry point', () => {
  it('reproduces the exploratory counts and exits inconclusive, not successful', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'eval/model-test/agenda-calibration.ts'],
      {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.stderr).not.toContain('CALIBRATION_FAILED');
    expect(result.status).toBe(1);
    const report: unknown = JSON.parse(result.stdout);
    console.log(result.stdout.trim());

    const adversarial = {
      num: 0,
      den: 42,
      perKind: Object.fromEntries(
        [
          'swapped-owner',
          'swapped-number',
          'flipped-negation',
          'wrong-role',
          'wrong-date',
          'action-inversion',
          'wrong-action-date',
        ].map((kind) => [kind, { num: 0, den: 6 }]),
      ),
    };
    const general = (recalled: number, negatives: number) => ({
      paraphraseRecall: { num: recalled, den: 10 },
      contradictionFalseCredit: { num: 0, den: negatives },
      irrelevantFalseCredit: { num: 0, den: negatives },
      duplicatesExactlyOnce: { num: 5, den: 5 },
    });
    expect(report).toMatchObject({
      embedder: 'trigram-stand-in',
      tuningCandidates: 244,
      chosen: { tau: 0.79, wEmbed: 0.8, recovered: 10 },
      baseline: { tau: 0.79, wEmbed: 0.5, general: general(6, 8), adversarial },
      tuning: { general: general(10, 7), adversarial },
      heldOut: { general: general(8, 8), adversarial },
      bars: { ok: false, failed: ['paraphrase-recall'] },
      status: 'INCONCLUSIVE',
    });
  }, 35_000);
});
