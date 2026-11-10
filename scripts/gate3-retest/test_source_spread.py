"""D6: the scored acoustic-end interval carries the frozen annotation's own source spread (Protocol v3 amendment, spread policy).

microphone-005 is a real unit of the r3 source pack (values copied from its annotation): nominal end 50.35 s, earliest 50.345 s,
latest 50.355 s. Before this change the scorer used the nominal end plus the anchor uncertainty only.
"""
import importlib.util
import unittest
from pathlib import Path

import v3a_timing as timing
from test_v3a_timing import mapping

spec = importlib.util.spec_from_file_location('bounds_spread', Path(__file__).with_name('analyze-bounds.py'))
bounds = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bounds)

ANCHOR_U = .001
MICROPHONE_005 = {'id': 'microphone-005', 'start': 49.91, 'last_word_start': 49.91, 'acoustic_end': 50.35,
                  'earliest_acoustic_end_s': 50.345, 'latest_acoustic_end_s': 50.355, 'acoustic_end_spread_s': .01,
                  'final_onset_threshold_spread_s': 0.0, 'threshold_spread_s': 0.0}


def anchors():
    return [{'id': name, 'source_start_s': start, 'source_end_s': start+2, 'recording_start_s': start,
             'recording_end_s': start+2, 'offset_s': 0, 'uncertainty_s': ANCHOR_U,
             'method': 'unique-exact-long-PCM', 'validated': True} for name, start in (('before', 10), ('after', 100))]


def scored(annotation, **changes):
    return {'id': annotation['id'], 'eligible': True, 'outcome': 'MATCHED', 'identity_confirmed': True,
            'source_start_s': annotation['start'], 'source_last_word_start_s': annotation['last_word_start'],
            'source_last_word_end_s': annotation['acoustic_end'], 'endpoints': [{'observed': 52.0, 'u': .2}], **changes}


def prepare(annotation, **changes):
    units = timing.attach_source_spread([scored(annotation, **changes)], [annotation])
    return timing.prepare_units(units, mapping(gap=0), anchors())[0][0]


class SourceSpread(unittest.TestCase):
    def test_microphone_005_end_interval_includes_the_source_spread_and_the_anchor_uncertainty(self):
        unit = prepare(MICROPHONE_005)
        self.assertAlmostEqual(unit['earliest_acoustic_end_s'], 50.345-ANCHOR_U)
        self.assertAlmostEqual(unit['latest_acoustic_end_s'], 50.355+ANCHOR_U)

    def test_both_bounds_move_in_the_conservative_direction(self):
        row = bounds.analyze_unit(prepare(MICROPHONE_005))
        self.assertAlmostEqual(row['conservative'], 52.0-(50.345-ANCHOR_U))  # earliest end: longest latency
        self.assertAlmostEqual(row['best'], 51.8-(50.355+ANCHOR_U))          # latest end: shortest latency
        point_only = 52.0-(50.35-ANCHOR_U), 51.8-(50.35+ANCHOR_U)           # what a2e8658 computed
        self.assertGreater(row['conservative'], point_only[0])
        self.assertLess(row['best'], point_only[1])

    def test_asymmetric_wide_offset_spread_is_carried_unchanged(self):
        wide = {**MICROPHONE_005, 'earliest_acoustic_end_s': 50.35-.04, 'latest_acoustic_end_s': 50.35+.075}
        unit = prepare(wide)
        self.assertAlmostEqual(unit['earliest_acoustic_end_s'], 50.35-.04-ANCHOR_U)
        self.assertAlmostEqual(unit['latest_acoustic_end_s'], 50.35+.075+ANCHOR_U)

    def test_onset_spreads_widen_the_start_intervals(self):
        spread = {**MICROPHONE_005, 'final_onset_threshold_spread_s': .015, 'threshold_spread_s': .015}
        unit = prepare(spread)
        self.assertAlmostEqual(unit['last_word_start_interval_s'][0], 49.91-.015-ANCHOR_U)
        self.assertAlmostEqual(unit['speech_start_interval_s'][1], 49.91+.015+ANCHOR_U)

    def test_annotation_spread_must_exist_bracket_and_agree(self):
        lacking = {k: v for k, v in MICROPHONE_005.items() if k != 'latest_acoustic_end_s'}
        with self.assertRaisesRegex(ValueError, 'lacks the acoustic end spread'):
            timing.attach_source_spread([scored(MICROPHONE_005)], [lacking])
        with self.assertRaisesRegex(ValueError, 'no frozen annotation entry'):
            timing.attach_source_spread([scored(MICROPHONE_005)], [])
        with self.assertRaisesRegex(ValueError, 'disagrees'):
            timing.attach_source_spread([scored(MICROPHONE_005, source_latest_acoustic_end_s=50.4)], [MICROPHONE_005])
        with self.assertRaisesRegex(ValueError, 'does not bracket'):
            prepare({**MICROPHONE_005, 'earliest_acoustic_end_s': 50.36})

    def test_scorer_glue_reads_the_spread_from_the_frozen_annotation(self):
        source = Path(__file__).with_name('analyze-bounds.py').read_text(encoding='utf-8')
        self.assertIn("attach_source_spread(units, inventory['utterances'])", source)
        self.assertIn("Source acoustic end spread missing", source)


if __name__ == '__main__':
    unittest.main()
