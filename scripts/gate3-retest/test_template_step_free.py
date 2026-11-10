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


if __name__ == '__main__':
    unittest.main()
