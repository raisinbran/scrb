"""The planted-truth bookkeeping of calibrate-long-correlation.py (no audio rendering, no ffmpeg)."""
import array
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('calibrate', Path(__file__).with_name('calibrate-long-correlation.py'))
calibrate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(calibrate)

RATE = calibrate.SOURCE_RATE


class Planting(unittest.TestCase):
    def test_same_seed_same_plan_and_magnitudes_in_the_stated_ranges(self):
        steps = calibrate.plant(7)
        self.assertEqual(steps, calibrate.plant(7))
        self.assertNotEqual(steps, calibrate.plant(8))
        self.assertEqual(len(steps), 8)
        self.assertEqual([p for p, _ in steps], sorted(p for p, _ in steps))
        for position, shift in steps:
            self.assertTrue(30*RATE <= position <= 370*RATE)
            self.assertTrue(.051*RATE-1 <= abs(shift) <= .210*RATE+1)

    def test_both_signs_occur_across_seeds(self):
        signs = {shift > 0 for seed in range(6) for _, shift in calibrate.plant(seed)}
        self.assertEqual(signs, {True, False})


class TruthMatchesTheTimeline(unittest.TestCase):
    def test_every_surviving_source_sample_sits_where_truth_says(self):
        source = array.array('h', (i % 30011 for i in range(40*RATE)))
        steps = [(10*RATE, 1200), (20*RATE, -3000), (30*RATE, 2400)]
        offset, declared = 5000, RATE
        timeline = calibrate.build_timeline(source, steps, offset)
        self.assertEqual(len(timeline), offset+len(source)+sum(s for _, s in steps))
        truth = calibrate.Truth(steps, offset, declared)
        for seconds in (1.0, 9.99, 10.5, 19.0, 21.0, 29.5, 33.0, 39.0):   # none inside a dropped stretch
            index = round(truth.recording_s(seconds)*declared)
            self.assertEqual(timeline[index], source[round(seconds*RATE)], seconds)

    def test_offset_is_the_fixed_offset_plus_the_steps_so_far(self):
        truth = calibrate.Truth([(10*RATE, 2400), (20*RATE, -1200)], 0, RATE)
        self.assertAlmostEqual(truth.offset_s(5), 0)
        self.assertAlmostEqual(truth.offset_s(15), .1)
        self.assertAlmostEqual(truth.offset_s(25), .05)

    def test_a_declared_rate_below_24_khz_is_a_planted_drift(self):
        truth = calibrate.Truth([], 0, 23987)
        self.assertAlmostEqual(truth.offset_s(100), 100*(RATE/23987-1))

    def test_step_inside_a_template_is_flagged(self):
        truth = calibrate.Truth([(10*RATE, 1200)], 0, RATE)
        self.assertTrue(truth.steps_inside(9, 12))
        self.assertFalse(truth.steps_inside(11, 14))


class Summary(unittest.TestCase):
    def test_median_p95_max(self):
        result = calibrate.summarize([i/100 for i in range(1, 101)])
        self.assertEqual((result['n'], result['max']), (100, 1.0))
        self.assertAlmostEqual(result['median'], .505)
        self.assertAlmostEqual(result['p95'], .95)
        self.assertIsNone(calibrate.summarize([]))


if __name__ == '__main__':
    unittest.main()
