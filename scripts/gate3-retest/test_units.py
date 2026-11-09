"""Exercise constructed timing with in-memory bursts only; no WAV or synthesis I/O."""
import array
from pathlib import Path
import unittest
import constructed_units as units


def make_burst(seconds=0.4, lead=0.1, trail=0.1):
    """Build deterministic PCM-shaped arrays without creating audio files."""
    return array.array('h', [0])*round(lead*units.RATE)+array.array('h', [1000])*round(seconds*units.RATE)+array.array('h', [0])*round(trail*units.RATE)


def make_tail(tail_s):
    """Build a burst whose last tail_s is visible to the primary threshold only (amplitude 150)."""
    return (array.array('h', [0])*2400+array.array('h', [1000])*4800+
            array.array('h', [150])*round(tail_s*units.RATE)+array.array('h', [0])*4800)


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
        with self.assertRaisesRegex(ValueError, 'Segment hash'):
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

    def test_rejects_onset_spread_over_25_ms(self):
        """Reject ambiguous low-energy onsets.

        The primary and absolute thresholds must not disagree by over 25 ms at onset.
        """
        samples = array.array('h', [0])*2400+array.array('h', [150])*720+array.array('h', [1000])*4800+array.array('h', [0])*2400
        with self.assertRaisesRegex(ValueError, 'Onset spread'):
            units.measure(samples)

    def test_offset_spread_limit_is_100_ms(self):
        """Accept an 80 ms trailing edge, reject 105 ms.

        Offsets may disagree further than onsets, but not without bound.
        """
        units.measure(make_tail(0.080))
        with self.assertRaisesRegex(ValueError, 'Offset spread'):
            units.measure(make_tail(0.105))

    def test_crop_keeps_every_threshold_supported_sample(self):
        """Keep the later trailing edge, plus 30 ms, inside the crop.

        An 80 ms tail visible only to the primary threshold must not be discarded.
        """
        samples = make_tail(0.080)
        measured = units.measure(samples)
        self.assertEqual((measured['offset'], measured['secondary_offset']), (9120, 7200))
        self.assertEqual(measured['crop_end'], 9120+720)
        self.assertEqual(measured['crop_start'], 2400-480)
        supported = [i for i, v in enumerate(samples) if abs(v) >= 128]
        self.assertGreaterEqual(supported[0], measured['crop_start'])
        self.assertLess(supported[-1], measured['crop_end'])
        self.assertGreaterEqual(measured['crop_end']-measured['later_offset'], round(0.030*units.RATE))

    def test_join_gap_uses_earlier_outgoing_offset(self):
        """Count the trailing edge's full ambiguity as near-silence.

        The earlier offset maximizes the quiet span the candidate VAD could see.
        """
        tail, plain = units.measure(make_tail(0.080)), units.measure(make_burst())
        self.assertAlmostEqual(units.assert_join(tail, plain, 960), (2640+960+480)/units.RATE)
        with self.assertRaisesRegex(ValueError, 'Effective join'):
            units.assert_join(tail, plain, round(0.160*units.RATE))

    def test_utterance_records_both_acoustic_ends(self):
        """Record earliest and latest plausible ends in seconds and samples.

        Earliest is the earlier offset minus 5 ms; latest is the later offset plus 5 ms.
        """
        samples = {'p': make_burst(4), 'f': make_tail(0.080)}
        measured = {key: units.measure(value) for key, value in samples.items()}
        parts = [{'unit_id': 'p', 'role': 'prefix', 'text': 'one two'}, {'unit_id': 'f', 'role': 'final', 'text': 'three'}]
        result = units.construct_utterance(parts, measured, samples)
        origin = result['segments'][1]['start']-measured['f']['crop_start']
        self.assertEqual(result['earliest_acoustic_end_sample'], origin+7200-120)
        self.assertEqual(result['latest_acoustic_end_sample'], origin+9120+120)
        self.assertAlmostEqual(result['acoustic_end_spread_s'], 0.090)
        self.assertEqual(result['earliest_acoustic_end_s'], result['earliest_acoustic_end_sample']/units.RATE)
        self.assertEqual(result['final_onset_threshold_spread_s'], 0.0)

    def test_utterance_speech_span_excludes_padding(self):
        """Measure speech from the earliest onset to the latest offset, not the padded clip."""
        samples = {'f': make_tail(0.080)}
        measured = {'f': units.measure(samples['f'])}
        result = units.construct_utterance([{'unit_id': 'f', 'role': 'final', 'text': 'word'}], measured, samples)
        self.assertAlmostEqual(result['speech_span_s'], (9120-2400)/units.RATE)
        self.assertGreater(len(result['pcm'])/units.RATE-result['speech_span_s'], 0.049)

    def test_report_only_records_instead_of_raising(self):
        """Record limit exceedances without a verdict and without changing measure().

        Report mode must flag the same cases that measure() rejects.
        """
        spread = array.array('h', [0])*2400+array.array('h', [150])*720+array.array('h', [1000])*4800+array.array('h', [0])*2400
        row = units.measure_report(spread)
        self.assertEqual(row['limits_exceeded'], ['onset_spread_over_25_ms'])
        self.assertEqual(units.measure_report(make_tail(0.080))['limits_exceeded'], [])
        self.assertEqual(units.measure_report(make_tail(0.105))['limits_exceeded'], ['offset_spread_over_100_ms'])
        self.assertGreater(row['onset_threshold_spread_s'], 0.025)
        self.assertEqual(units.measure_report(array.array('h', [0])*4800)['limits_exceeded'], ['no_active_frame'])
        self.assertEqual(units.measure_report(make_burst(lead=0))['limits_exceeded'], ['clipped_edge', 'crop_padding_clips_unit'])
        good = units.measure_report(make_burst())
        self.assertEqual(good['limits_exceeded'], [])
        self.assertEqual(good['onset'], units.measure(make_burst())['onset'])
        self.assertNotIn('status', good)

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

    def test_rejects_off_grid_half_second_silence(self):
        """Reject a true 0.5 s silence that starts between 5 ms frame boundaries.

        On the fixed grid such a gap can cover only 99 whole frames.
        """
        samples = array.array('h', [1000])*(246*units.RATE)
        start = 200*units.RATE+60
        samples[start:start+12000] = array.array('h', [0])*12000
        with self.assertRaisesRegex(ValueError, 'near-silence'):
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


class TestRateSingleSource(unittest.TestCase):
    """Keep the prosody rate in one place so the manifest records what was rendered."""

    root = Path(__file__).parent

    def test_renderer_has_no_hardcoded_rate(self):
        """Fail if the renderer carries its own copy of the old slowdown."""
        renderer = (self.root/'UnitRenderer.cs').read_text(encoding='utf-8-sig')
        self.assertNotIn('-15%', renderer)
        self.assertIn('rate != "default"', renderer)
        self.assertIn('<prosody', renderer)

    def test_spec_declares_per_track_rate_and_manifest_records_it(self):
        """Declare the rate once per track and pass it, unmodified, to render and manifest."""
        specs = (self.root/'speech-specs.ps1').read_text(encoding='utf-8-sig')
        self.assertIn("track='microphone';voice='Microsoft David Desktop';rate='-15%'", specs)
        self.assertIn("track='meeting';voice='Microsoft Zira Desktop';rate='default'", specs)
        self.assertEqual(specs.count('-15%'), 1)
        self.assertIn('prosody_rate=$spec.rate', specs)
        script = (self.root/'render-constructed-units.ps1').read_text(encoding='utf-8-sig')
        self.assertIn('Render($unit.voice,$unit.text,$unit.prosody_rate,$file)', script)
        self.assertIn('$row[$key]=$unit[$key]', script)
        self.assertIn("if (Test-Path -LiteralPath $OutputDirectory) { throw", script)
        self.assertLess(script.index('Test-Path -LiteralPath $OutputDirectory'), script.index('New-Item -ItemType Directory'))


if __name__ == '__main__':
    unittest.main()
