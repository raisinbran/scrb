"""Unit-level timing coverage on the scoring path: units whose timing cannot be established are neither late nor credited.

TIMING-INCONCLUSIVE semantics, the unexplained-offset-disagreement intervals found before exclusion, scored words that overlap a
recorded capture gap, the extra drift uncertainty for a farther anchor, and the lead marker. The anchor constants and the
TIMING-INCONCLUSIVE credit rule are proposed, owner approval pending."""
import tempfile
import unittest
from unittest.mock import patch

import binding_fixture
import marker_clock
import v3a_timing as timing
from test_analysis import make_unit
from test_v3a_timing import bounds


def split_records(split_s, gap=.210, rate=1000, total_s=400):
    return [{'seq': 0, 'source_sha256': 'a'*64, 'start_ns': 0, 'metadata_start_ns': 0,
             'metadata_end_ns': split_s*10**9, 'decoded_samples': split_s*rate},
            {'seq': 1, 'source_sha256': 'b'*64, 'start_ns': round((split_s+gap)*1e9), 'metadata_start_ns': round((split_s+gap)*1e9),
             'metadata_end_ns': round((total_s+gap)*1e9), 'decoded_samples': (total_s-split_s)*rate}]


def anc(name, begin, offset=0.0, uncertainty=.013):
    return {'id': name, 'source_start_s': begin+.1, 'source_end_s': begin+3.118, 'source_utterance_start_s': begin,
            'source_utterance_end_s': begin+4, 'recording_start_s': begin+.1+offset, 'recording_end_s': begin+3.118+offset,
            'offset_s': offset, 'uncertainty_s': uncertainty, 'validated': True, 'unique': True,
            'method': 'bounded-long-correlation', 'methods': [{'unique': True}]*3}


def mk(name, start, last_word_start, end, latency=1.5, **changes):
    return binding_fixture.sourced(make_unit(**{
        'id': name, 'continuous_start_s': start, 'continuous_last_word_start_s': last_word_start, 'continuous_last_word_end_s': end,
        'endpoints': [{'observed': end+latency, 'u': .01}], **changes}))


def own(anchor, **changes):
    """The anchor's own full utterance: the scorer needs it to cover the track edges."""
    begin = anchor['source_utterance_start_s']
    return mk(anchor['id'], begin, begin+3.5, begin+4, **changes)


def score(units, anchor_list, split_s=200):
    inventory = {'anchors': anchor_list, 'utterances': [binding_fixture.frozen_entry({**u, 'eligible': True}) for u in units],
                 'annotations_sha256': 'd'*64}
    m = binding_fixture.enrich(timing.gap_map(split_records(split_s), 'microphone', 1000, 'c'*64))
    with tempfile.TemporaryDirectory() as directory:
        bound_units, files = binding_fixture.bind_units(directory, m, units)
        clock = {'valid': True, 'gap_map': m, 'original_timestamped': {'valid': False, 'latency': 'INCONCLUSIVE'}}
        evidence = {'publication_basis': 'timestamped-capture', 'chunks': 'chunks.json', 'decoder': 'decoder', 'source': 'source.wav',
                    'harness': [11, 391], 'long_anchors': [{}, {}], 'source_annotations': 'annotations.json', **files}
        with patch.object(marker_clock, 'analyze_v3a', return_value=clock), \
             patch.object(timing, 'load_views', return_value=([], [], m)), \
             patch.object(timing, 'pcm16', return_value=([], 1000)), \
             patch.object(timing, 'load_long_anchors', return_value=inventory), \
             patch.object(timing, 'digest', return_value='c'*64), \
             binding_fixture.without_regeneration(bounds):
            return bounds.analyze_v3a_track(bound_units, evidence, 'microphone')


def spaced(offsets=None, step=20):
    """Anchors every `step` s from 100 to 300 s, leaving the template at 200 s (the capture gap) free."""
    offsets = offsets or {}
    return [anc('a%d' % b, b, offsets.get(b, 0.0)) for b in range(100, 301, step) if b != 200]


class TestTimingInconclusiveSemantics(unittest.TestCase):
    def fixture(self, gap_units, late=()):
        anchors = spaced()
        fillers = [mk('f%d' % i, 105+20*i+3, 105+20*i+4, 105+20*i+5) for i in range(8 - len(gap_units) + 1)]
        units = [own(a) for a in anchors]+fillers
        units += [mk('gap%d' % i, 196, 198.5, 200.4+i*.01) for i in range(len(gap_units))]
        units += [mk('late%d' % i, 150+i, 151+i, 152+i, latency=8.0) for i in range(len(late))]
        return units, anchors

    def test_clean_failure_window_unit_marked_timing_inconclusive_is_not_failure_observed(self):
        units, anchors = self.fixture([0])
        result = score(units, anchors)
        self.assertNotIn('error', result)
        inconclusive = {u['id']: u['reason'] for u in result['timing_inconclusive_units']}
        self.assertIn('overlaps a recorded capture gap', inconclusive['gap0'])
        row = {u['id']: u for u in result['units']}['gap0']
        self.assertEqual((row['outcome'], row['conservative'], row['best']), ('TIMING-INCONCLUSIVE', float('inf'), float('-inf')))
        self.assertEqual(result['recurrence'], 'INDETERMINATE')       # not late, not UNIDENTIFIED: it cannot make FAILURE OBSERVED
        self.assertEqual(result['denominator'], len(units))            # stays in the denominator

    def test_layer_a_that_depends_on_timing_inconclusive_units_is_inconclusive_not_fail(self):
        units, anchors = self.fixture([0, 1])
        result = score(units, anchors)
        self.assertEqual(len(result['timing_inconclusive_units']), 2)
        n = len(units)
        self.assertEqual(result['bounds']['conservative']['within6'], n-2)     # no credit in the conservative bound
        self.assertFalse(result['bounds']['conservative']['pass'])              # 90% of 20 < 95%
        self.assertTrue(result['bounds']['best']['pass'])                       # the best case may still credit them
        self.assertEqual(result['latency'], 'INCONCLUSIVE')                     # so no definitive FAIL

    def test_a_definite_late_unit_still_gives_failure_observed(self):
        units, anchors = self.fixture([0], late=[0])
        # the late unit sits in the failure window (170-245 s) and is more than 6 s late even in the best case
        units = [u if u['id'] != 'late0' else mk('late0', 201, 202, 203, latency=8.0) for u in units]
        result = score(units, anchors)
        self.assertEqual({u['id'] for u in result['timing_inconclusive_units']}, {'gap0'})
        self.assertEqual(result['recurrence'], 'FAILURE OBSERVED')


class TestUnexplainedDisagreementIntervals(unittest.TestCase):
    EXCURSION = {140: -.08}

    def test_excursion_that_returns_keeps_its_units_inconclusive_and_spares_the_rest(self):
        anchors = spaced(self.EXCURSION, step=10)
        inside, before, after = mk('inside', 140, 140.5, 141.5), mk('before', 105, 106, 107), mk('after', 175, 176, 177)
        result = score([own(a) for a in anchors]+[inside, before, after], anchors)
        self.assertNotIn('error', result)
        by = {u['id']: u['reason'] for u in result['timing_inconclusive_units']}
        self.assertIn('unexplained offset change', by['inside'])
        self.assertNotIn('before', by)
        self.assertNotIn('after', by)
        rows = {u['id']: u['outcome'] for u in result['units']}
        self.assertEqual((rows['before'], rows['after'], rows['inside']), ('MATCHED', 'MATCHED', 'TIMING-INCONCLUSIVE'))
        self.assertEqual({e['id'] for e in result['anchor_exclusions']}, {'a130', 'a140', 'a150'})
        self.assertEqual(len(result['unexplained_intervals']), 1)
        # the survivors agree, so without the intervals found before exclusion the unit would regain credit
        marked = timing.apply_template_step_condition(anchors, binding_fixture.enrich(timing.gap_map(split_records(200), 'microphone', 1000, 'c'*64)))
        valid = [a for a in marked if a['template_step_free']]
        self.assertIsNone(timing.unit_timing_gap(140, 141.5, marked, valid, timing.unexplained_brackets(valid, {'chunks': [], 'rate': 1000})))

    def test_persistent_unexplained_step_restores_the_policy_end_to_end(self):
        # coverage lost when test_v3a_conditional patched out unexplained_brackets: an unlogged step through the real analysis
        anchors = spaced({b: .08 for b in range(120, 301, 20)})
        inside, outside = mk('inside', 115, 116, 117), mk('outside', 245, 246, 247)
        result = score([own(a) for a in anchors]+[inside, outside], anchors)
        by = {u['id']: u['reason'] for u in result['timing_inconclusive_units']}
        self.assertIn('unexplained offset change', by['inside'])
        self.assertNotIn('outside', by)


class TestCoverageLimitAndDrift(unittest.TestCase):
    def test_unit_that_lost_its_anchor_beyond_30_s_is_inconclusive_and_nearer_ones_carry_drift(self):
        # the 181 s gap lies inside the template of a180, which is excluded; a160 and a220 remain
        anchors = spaced()
        far, near = mk('far', 197, 198, 199), mk('near', 188, 189, 190)
        result = score([own(a) for a in anchors]+[far, near], anchors, split_s=181)
        self.assertEqual({e['id'] for e in result['anchor_exclusions']}, {'a180'})
        by = {u['id']: u['reason'] for u in result['timing_inconclusive_units']}
        self.assertIn('within 30 s', by['far'])           # 199 - 163.118 = 35.9 s from the nearest valid anchor before it
        self.assertNotIn('near', by)                      # 190 - 163.118 = 26.9 s
        used = {u['id']: u for u in result['speech_intervals']}['near']
        self.assertAlmostEqual(used['drift_extra_uncertainty_s'], timing.DRIFT_RATE_BOUND_S_PER_S*20.0)
        self.assertAlmostEqual(used['timing_anchor_uncertainty_s'], .013+timing.DRIFT_RATE_BOUND_S_PER_S*20.0)

    def test_lead_marker_cannot_stand_in_for_a_valid_long_anchor_near_the_first_long_anchor(self):
        lead = timing.lead_marker_anchor({'valid': True, 'lead': {'position': 1.0, 'uncertainty_s': .002}}, 1.0, .002)
        first, second = {**anc('a20', 20), 'template_step_free': False}, anc('a60', 60)
        anchors = [lead, first, second]
        valid = [lead, second]
        timing.track_anchor_gate(anchors, valid)                                        # a valid long anchor exists: no track failure
        self.assertIn('within 30 s', timing.unit_timing_gap(40, 43, anchors, valid, []))  # lead is 38 s away, a20 (excluded) served it
        with self.assertRaisesRegex(ValueError, 'No valid long anchor remains'):
            timing.track_anchor_gate(anchors, [lead])                                   # the lead marker alone is not a long anchor


class TestCaptureGapOverlap(unittest.TestCase):
    def test_word_overlapping_a_recorded_gap_is_inconclusive_but_one_clear_of_it_is_not(self):
        anchors = spaced()
        straddle, clear = mk('straddle', 196, 198.5, 200.4), mk('clear', 190, 191, 192)
        result = score([own(a) for a in anchors]+[straddle, clear], anchors)
        by = {u['id']: u['reason'] for u in result['timing_inconclusive_units']}
        self.assertEqual(set(by), {'straddle'})
        self.assertIn('200.000 s', by['straddle'])


if __name__ == '__main__':
    unittest.main()
