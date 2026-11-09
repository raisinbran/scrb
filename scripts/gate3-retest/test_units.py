"""Exercise constructed timing with in-memory bursts only; no WAV or synthesis I/O."""
import array
from pathlib import Path
import unittest
import constructed_units as units


def make_burst(seconds=0.4, lead=0.1, trail=0.1):
    """Build deterministic PCM-shaped arrays without creating audio files."""
    return array.array('h', [0])*round(lead*units.RATE)+array.array('h', [1000])*round(seconds*units.RATE)+array.array('h', [0])*round(trail*units.RATE)


def make_utterance():
    """Construct one prefix/final pair for arithmetic tests."""
    samples = {'p': make_burst(4), 'f': make_burst()}
    measured = {key: units.measure(value) for key, value in samples.items()}
    parts = [{'unit_id': 'p', 'role': 'prefix', 'text': 'one two three four five six seven eight nine ten'},
             {'unit_id': 'f', 'role': 'final', 'text': 'eleven'}]
    return units.construct_utterance(parts, measured, samples), measured


class TestConstructedUnits(unittest.TestCase):
    """Protect sample arithmetic without claiming independent acoustic ground truth."""

    def test_measurement_within_five_ms(self):
        """Locate known synthetic edges within one analysis frame.

        Off-grid edges exercise quantization rather than only exact frame boundaries.
        """
        measured = units.measure(make_burst(0.403, 0.101, 0.1))
        self.assertLessEqual(abs(measured['onset']/units.RATE-0.101), 0.005)
        self.assertLessEqual(abs(measured['offset']/units.RATE-0.504), 0.005)
        self.assertEqual(measured['frame_resolution_s'], 0.005)

    def test_crop_and_exact_join_counts(self):
        """Keep measured padding and inserted zeros exact.

        Crop-end sensitivity must remain distinct from the acoustic endpoint.
        """
        result, measured = make_utterance()
        self.assertEqual(measured['f']['onset']-measured['f']['crop_start'], 480)
        self.assertEqual(measured['f']['crop_end']-measured['f']['offset'], 720)
        self.assertEqual(result['silences'][0]['end']-result['silences'][0]['start'], 960)
        self.assertAlmostEqual(result['crop_end_bound']-result['acoustic_end'], 0.030)
        verdict = units.verify_arithmetic(result['pcm'], result['segments'], result['silences'])
        self.assertFalse(verdict['independent_acoustic_ground_truth'])
        self.assertEqual(verdict['status'], 'UNFROZEN')

    def test_rejects_one_sample_join_mutation(self):
        """Reject a single extra sample even if its value is zero.

        Silence alone does not prove that concatenation offsets are correct.
        """
        result, _ = make_utterance()
        result['pcm'].insert(result['silences'][0]['start'], 0)
        with self.assertRaises(ValueError):
            units.verify_arithmetic(result['pcm'], result['segments'], result['silences'])

    def test_rejects_nonzero_silence(self):
        """Reject contamination inside an inserted zero span.

        Segment hashes do not cover the deliberate join silence.
        """
        result, _ = make_utterance()
        result['pcm'][result['silences'][0]['start']] = 1
        with self.assertRaisesRegex(ValueError, 'Non-zero'):
            units.verify_arithmetic(result['pcm'], result['segments'], result['silences'])

    def test_rejects_overlap(self):
        """Reject overlapping provenance partitions.

        A valid hash cannot authorize assigning the same samples twice.
        """
        result, _ = make_utterance()
        result['segments'].append(result['segments'][0].copy())
        with self.assertRaisesRegex(ValueError, 'Overlap'):
            units.verify_arithmetic(result['pcm'], result['segments'], result['silences'])

    def test_rejects_threshold_spread_over_25_ms(self):
        """Reject ambiguous low-energy boundaries.

        The primary and absolute thresholds must not disagree by over 25 ms.
        """
        samples = array.array('h', [0])*2400+array.array('h', [150])*720+array.array('h', [1000])*4800+array.array('h', [0])*2400
        with self.assertRaisesRegex(ValueError, 'Threshold spread'):
            units.measure(samples)

    def test_rejects_clipped_or_silent_units(self):
        """Fail when an acoustic edge cannot be measured safely.

        Clipping must not be repaired by inventing padding or changing thresholds.
        """
        for samples in (make_burst(lead=0), array.array('h', [0])*4800):
            with self.subTest(length=len(samples)), self.assertRaises(ValueError):
                units.measure(samples)

    def test_effective_join_limit_in_seconds(self):
        """Include both crop tails in the VAD split comparison.

        Comparing inserted samples alone would miss the actual near-silence span.
        """
        _, measured = make_utterance()
        self.assertAlmostEqual(units.assert_join(measured['p'], measured['f'], 960), 0.09)
        with self.assertRaisesRegex(ValueError, 'Effective join'):
            units.assert_join(measured['p'], measured['f'], round(0.230*units.RATE))

    def test_rejects_half_second_in_failure_window(self):
        """Reject exactly half a second inside the mandated recording interval.

        The arithmetic check does not waive the continuous-speech requirement.
        """
        samples = array.array('h', [1000])*(246*units.RATE)
        samples[200*units.RATE:round(200.5*units.RATE)] = array.array('h', [0])*12000
        with self.assertRaisesRegex(ValueError, '0.5 seconds'):
            units.assert_window_energy_gap(samples)

    def test_wpm_bounds(self):
        """Enforce both inclusive track-rate boundaries.

        Slowing or speeding source construction cannot silently change the workload.
        """
        self.assertEqual(units.assert_wpm(130, 60), 130)
        self.assertEqual(units.assert_wpm(170, 60), 170)
        for count in (129, 171):
            with self.assertRaises(ValueError):
                units.assert_wpm(count, 60)

    def test_rejects_legacy_timing_and_bypasses_probe(self):
        """Keep the constructed path independent of rejected engine timing.

        Static dispatch checks avoid running prepare-speech.ps1 during development.
        """
        for payload in ({'marks': []}, {'units': [{'AudioPosition': 1}]}, {'basis': 'AudioPosition'}):
            with self.assertRaisesRegex(ValueError, 'forbidden'):
                units.reject_engine_timing(payload)
        root = Path(__file__).parent
        source = (root/'prepare-speech.ps1').read_text(encoding='utf-8-sig')
        branch = source[source.index("if ($Method -eq 'ConstructedUnits')"):source.index("if (-not $Probe)")]
        self.assertIn('render-constructed-units.ps1', branch)
        self.assertIn('return', branch)
        self.assertLess(source.index("if ($Method -eq 'ConstructedUnits')"), source.index('SpeechRenderer.cs'))
        renderer = (root/'UnitRenderer.cs').read_text()
        for forbidden in ('AudioPosition', 'BookmarkReached', '<mark'):
            self.assertNotIn(forbidden, renderer)


if __name__ == '__main__':
    unittest.main()
