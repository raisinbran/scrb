"""D4: the calibrated 13-17 ms anchor uncertainty needs a template established step-free from what the scorer can see."""
import unittest

import v3a_timing as timing
from test_v3a_timing import mapping, bounds   # mapping(gap) has one 210 ms chunk-timestamp gap at 140 s


def anchor(name, begin, offset, uncertainty=.013):
    return {'id': name, 'source_start_s': begin, 'source_end_s': begin+3.02,
            'recording_start_s': begin+offset, 'recording_end_s': begin+3.02+offset, 'offset_s': offset,
            'uncertainty_s': uncertainty, 'method': 'bounded-long-correlation', 'validated': True, 'unique': True,
            'methods': [{'unique': True}]*3}


class TestTemplateStepFree(unittest.TestCase):
    def test_clean_anchors_far_from_any_event_keep_the_calibrated_uncertainty(self):
        marked = timing.apply_template_step_condition([anchor('a', 20, 3.7), anchor('b', 60, 3.7)], mapping())
        self.assertTrue(all(a['template_step_free'] for a in marked))
        timing.step_bounds(marked, [])

    def test_peak_validated_anchor_whose_template_spans_a_chunk_gap_gets_no_credit(self):
        spanning = anchor('spans', 138, 0.0)       # template 138.0-141.02 contains the 140 s gap
        marked = timing.apply_template_step_condition([anchor('a', 20, 0.0), spanning, anchor('c', 200, .21)], mapping())
        flags = {a['id']: a['template_step_free'] for a in marked}
        self.assertFalse(flags['spans'])
        self.assertIn('inside the template support', marked[1]['template_step_reason'])
        with self.assertRaisesRegex(ValueError, 'not established step-free'):
            timing.step_bounds(marked, [])

    def test_margin_covers_a_gap_just_outside_the_template(self):
        near = anchor('near', 136.97, 0.0)    # ends 10 ms before the 140 s gap: inside uncertainty + one frame
        far = anchor('far', 136.0, 0.0)       # ends 0.98 s before it
        self.assertFalse(timing.apply_template_step_condition([near], mapping())[0]['template_step_free'])
        self.assertTrue(timing.apply_template_step_condition([far], mapping())[0]['template_step_free'])

    def test_detected_step_explained_by_a_gap_between_the_supports_is_allowed(self):
        marked = timing.apply_template_step_condition([anchor('a', 100, 0.0), anchor('b', 150, .21)], mapping())
        self.assertTrue(all(a['template_step_free'] for a in marked))
        self.assertEqual(len(timing.step_bounds(marked, [])), 1)

    def test_detected_step_with_no_gap_between_the_supports_fails_both_neighbours_closed(self):
        marked = timing.apply_template_step_condition([anchor('a', 20, 0.0), anchor('b', 60, .08), anchor('c', 90, .08)], mapping())
        self.assertEqual([a['template_step_free'] for a in marked], [False, False, True])
        self.assertIn('not located', marked[0]['template_step_reason'])
        with self.assertRaisesRegex(ValueError, 'not established step-free'):
            timing.step_bounds(marked, [])

    def test_small_offset_change_is_not_a_detected_step(self):
        marked = timing.apply_template_step_condition([anchor('a', 20, 0.0), anchor('b', 60, .02)], mapping())
        self.assertTrue(all(a['template_step_free'] for a in marked))


def split(anchors):
    marked = timing.apply_template_step_condition(anchors, mapping())
    excluded = {i for i, _ in timing.excluded_anchors(marked)}
    return marked, [a for a in marked if a['id'] not in excluded], excluded


class TestPerAnchorExclusion(unittest.TestCase):
    """One failed anchor excludes only itself; track-level failures stay track-level."""
    def eight(self):
        # 40 s spacing; 'spans' has the 210 ms gap at 140 s inside its template and the step really happened there
        names = [('a', 20, 0), ('b', 60, 0), ('c', 100, 0), ('spans', 138, 0), ('e', 176, .21), ('f', 216, .21),
                 ('g', 256, .21), ('h', 296, .21)]
        return [anchor(n, b, o) for n, b, o in names]

    def gap(self, valid, marked, onset, last_end):
        brackets = timing.unexplained_brackets(valid, mapping())
        return timing.unit_timing_gap(onset, last_end, marked, valid, brackets)

    def test_a_one_excluded_anchor_loses_only_the_units_that_depend_on_it(self):
        marked, valid, excluded = split(self.eight())
        self.assertEqual(excluded, {'spans'})
        timing.track_anchor_gate(marked, valid)
        self.assertIsNone(self.gap(valid, marked, 45, 50))      # between valid a/b and c: scored
        self.assertIsNone(self.gap(valid, marked, 230, 236))    # far from the gap: scored
        self.assertIsNone(self.gap(valid, marked, 70, 75))
        self.assertIn('within 30 s', self.gap(valid, marked, 139, 141))   # across the dropout: nearest valid anchors 38 s and 36 s away
        self.assertIn('within 30 s', self.gap(valid, marked, 125, 130))   # next valid anchor after it is 46 s away
        # the excluded anchor gets no calibrated uncertainty and the step bounds refuse it
        self.assertFalse(next(a for a in marked if a['id'] == 'spans')['template_step_free'])
        with self.assertRaisesRegex(ValueError, 'not established step-free'):
            timing.step_bounds(marked, [])
        timing.step_bounds(valid, [])   # the valid anchors alone still bound the located step

    def test_b_unexplained_offset_change_without_a_timestamp_event_still_fails_closed(self):
        a, b, c = anchor('a', 20, 0.0), anchor('b', 60, .08), anchor('c', 100, .08)
        marked, valid, excluded = split([a, b, c])
        self.assertEqual(excluded, {'a', 'b'})                  # both neighbours of the unlocated step lose the calibrated value
        # Anchors that were nevertheless kept (for example the step is below what excludes an anchor) are bracketed:
        kept = [{**a, 'template_step_free': True}, {**b, 'template_step_free': True}, {**c, 'template_step_free': True}]
        brackets = timing.unexplained_brackets(kept, mapping())
        self.assertEqual([(q['id'], r['id']) for q, r in brackets], [('a', 'b')])
        self.assertIn('unexplained offset change', timing.unit_timing_gap(30, 40, kept, kept, brackets))
        self.assertIsNone(timing.unit_timing_gap(70, 80, kept, kept, brackets))    # after the change, between b and c
        # a step located by the 140 s chunk gap is explained and is not a bracket
        located = [anchor('a', 100, 0.0), anchor('b', 150, .21)]
        self.assertEqual(timing.unexplained_brackets(located, mapping()), [])

    def test_c_no_count_gate_only_the_absence_of_any_valid_long_anchor_ends_the_track(self):
        anchors = self.eight()
        for dropped in (['spans'], ['spans', 'e', 'f', 'g'], ['a', 'b', 'c', 'spans', 'e', 'f', 'g']):
            marked = [{**a, 'template_step_free': a['id'] not in dropped} for a in anchors]
            timing.track_anchor_gate(marked, [a for a in marked if a['template_step_free']])   # no share or minimum count
        marked = [{**a, 'template_step_free': False} for a in anchors]
        with self.assertRaisesRegex(ValueError, 'No valid long anchor remains'):
            timing.track_anchor_gate(marked, [])
        unvalidated = [{**a, 'validated': i < 3} for i, a in enumerate(anchors)]   # five of eight unvalidated: units, not the track
        timing.track_anchor_gate(unvalidated, [a for a in unvalidated if a['validated']])


if __name__ == '__main__':
    unittest.main()
