"""Noisy long-only matching; retained interior criteria, no new thresholds."""
import array
import importlib.util
import json
import math
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import test_v3a_timing as v3a_fixtures

import long_correlation as correlation
from v3a_timing import digest, pcm16, prepare_units, step_bounds
from test_v3a_timing import mapping, unit


def speech_like(seed=51, rate=4000, seconds=24):
    """Invent varied voiced bursts, releases, breath noise and a formant carrier."""
    rng = random.Random(seed)
    controls = [rng.uniform(.08, 1) if rng.random() > .22 else 0 for _ in range(round(seconds*20)+2)]
    values = array.array('h')
    for i in range(round(seconds*rate)):
        position = i/rate*20
        k = int(position)
        amplitude = controls[k]*(1-(position-k))+controls[k+1]*(position-k)
        t = i/rate
        carrier = math.sin(2*math.pi*133*t)+.4*math.sin(2*math.pi*431*t)+.2*rng.uniform(-1, 1)
        values.append(round(6500*amplitude*carrier))
    return values


def noisy_recording(source, rate, change=.080):
    rng = random.Random(91)
    noisy = array.array('h', [round(.63*v+rng.gauss(0, 110)) for v in source])
    step = 12*rate
    if change >= 0:
        return noisy[:step]+array.array('h', [round(rng.gauss(0, 110)) for _ in range(round(change*rate))])+noisy[step:]
    return noisy[:step]+noisy[step+round(-change*rate):]


def long_units(rate):
    return [{'id': name, 'short': False, 'source_start_sample': round(a*rate), 'source_end_sample': round(b*rate)}
            for name, a, b in [('before', 3, 7), ('after', 14, 18)]]


class TestNoisyLongCorrelation(unittest.TestCase):
    def test_injected_positive_and_negative_step_with_gain_and_noise(self):
        rate = 4000
        source = speech_like(rate=rate)
        for change in (.080, -.080):
            recording = noisy_recording(source, rate, change)
            report = correlation.detect_long_steps(recording, rate, source, rate, long_units(rate), 0)
            self.assertEqual(report['timing'], 'BOUNDED', report.get('error'))
            self.assertEqual(len(report['steps']), 1)
            step = report['steps'][0]
            self.assertEqual(step['anchors'], ['before', 'after'])
            self.assertEqual(math.copysign(1, step['signed_change_s']), math.copysign(1, change))
            self.assertLessEqual(step['magnitude_interval_s'][0], change)
            self.assertGreaterEqual(step['magnitude_interval_s'][1], change)
            self.assertLessEqual(step['location_interval_s'][0], 12)
            self.assertGreaterEqual(step['location_interval_s'][1], 12)
            self.assertTrue(all(all(m['unique'] for m in a['methods']) for a in report['anchors']))
            u = unit(continuous_start_s=10, continuous_last_word_start_s=11, continuous_last_word_end_s=12)
            first = unit(id='before', continuous_start_s=3, continuous_last_word_start_s=6.8,
                         continuous_last_word_end_s=7)
            last = unit(id='after', continuous_start_s=14+change, continuous_last_word_start_s=17.8+change,
                        continuous_last_word_end_s=18+change)
            prepared, _ = prepare_units([first, u, last], mapping(), report['anchors'])
            self.assertAlmostEqual(prepared[1]['earliest_acoustic_end_s'], 12-step['symmetric_uncertainty_s'])
            self.assertAlmostEqual(prepared[1]['latest_acoustic_end_s'], 12+step['symmetric_uncertainty_s'])

    def test_full_unit_coverage_is_independent_of_narrow_template_support(self):
        source = speech_like()
        report = correlation.detect_long_steps(noisy_recording(source, 4000), 4000,
                                              source, 4000, long_units(4000), 0)
        first = unit(id='before', continuous_start_s=3, continuous_last_word_start_s=6.8,
                     continuous_last_word_end_s=7)
        last = unit(id='after', continuous_start_s=14.08, continuous_last_word_start_s=17.88,
                    continuous_last_word_end_s=18.08)
        prepared, steps = prepare_units([first, last], mapping(), report['anchors'])
        self.assertEqual(len(prepared), 2)
        self.assertEqual(steps, report['steps'])
        self.assertEqual(prepared[-1]['last_word_end'], 18.08)
        for bad in ([{**first, 'id': 'misbound'}, last], [first],
                    [{**first, 'continuous_start_s': 3.11}, last],
                    [first, {**last, 'continuous_last_word_end_s': 17.1}],
                    [{**first, 'continuous_start_s': float('nan')}, last]):
            with self.subTest(units=bad), self.assertRaises(ValueError):
                prepare_units(bad, mapping(), report['anchors'])

    def test_no_step_and_native_rate_envelopes(self):
        source = speech_like()
        recording = noisy_recording(source, 4000, 0)
        # Native samples of the same waveform at two rates; envelope construction
        # does not resample either PCM array.
        low_rate_source = source[::2]
        report = correlation.detect_long_steps(recording, 4000, low_rate_source, 2000, long_units(2000), 0)
        self.assertEqual(report['timing'], 'BOUNDED', report.get('error'))
        self.assertEqual(report['steps'], [])

    def test_duplicate_long_match_is_inconclusive(self):
        rate = 4000
        source = speech_like()
        # Repeated modulation creates genuinely complete, separated candidate
        # supports; overlapping copies would accidentally alter the first match.
        periodic = array.array('h', [round(7000*(.5+.4*math.sin(2*math.pi*2*i/rate))
                       *math.sin(2*math.pi*140*i/rate)) for i in range(24*rate)])
        report = correlation.detect_long_steps(periodic, rate, periodic, rate, long_units(rate), 0)
        self.assertEqual(report['timing'], 'INCONCLUSIVE')
        self.assertEqual(report['steps'], [])
        self.assertTrue(any(not a['unique'] for a in report['anchors']))
        with self.assertRaisesRegex(ValueError, 'Short-word'):
            correlation.match_long_correlation(source, rate, source, rate,
                                               {**long_units(rate)[0], 'short': True}, 3.1)

    def test_wrong_window_flat_and_unbounded_support_fail_closed(self):
        source = speech_like()
        rate = 4000
        wrong = correlation.match_long_correlation(source, rate, source, rate, long_units(rate)[0], 14.1)
        self.assertFalse(wrong['validated'])
        silence = array.array('h', [0])*len(source)
        self.assertEqual(correlation.detect_long_steps(silence, rate, source, rate,
                         long_units(rate), 0)['timing'], 'INCONCLUSIVE')
        self.assertEqual(correlation.detect_long_steps(source, rate, source, rate,
                         long_units(rate), -5)['timing'], 'INCONCLUSIVE')

    def test_production_inventory_routes_native_rates_to_correlation(self):
        rate = 4000
        source = speech_like()
        recording = noisy_recording(source, rate)
        low = source[::2]
        inventory = [{**u, 'eligible': True} for u in long_units(2000)]
        with tempfile.TemporaryDirectory() as directory:
            annotations = Path(directory)/'source.json'
            annotations.write_text(json.dumps({'frozen': True, 'sample_rate': 2000,
                'source_sha256': 'a'*64, 'utterances': inventory}), encoding='utf-8')
            searches = [{'id': u['id']} for u in inventory]
            result = v3a_fixtures.timing.load_long_anchors(recording, low, 2000, searches,
                       annotations, 'a'*64, method='bounded-correlation', recording_rate=rate, search_offset_s=0)
            steps = step_bounds(result['anchors'], [])
            self.assertEqual(len(steps), 1)
            self.assertTrue(all(a['method'] == 'bounded-long-correlation' for a in result['anchors']))
            self.assertEqual(result['utterances'], inventory)
            self.assertEqual(result['annotations_sha256'], digest(annotations))

    def test_nonunique_brackets_suppress_track_acceptance_and_keep_denominator(self):
        invalid = [{**a, 'method': 'bounded-long-correlation', 'validated': False,
                    'unique': False, 'methods': [{'unique': False}]*3} for a in v3a_fixtures.anchors()]
        with patch.object(v3a_fixtures, 'anchors', return_value=invalid):
            result = v3a_fixtures.TestScoringGuards().score([unit()])
        self.assertEqual(result['latency'], 'INCONCLUSIVE')
        self.assertIsNone(result['bounds'])
        self.assertEqual(result['denominator'], 1)
        self.assertEqual(result['steps'], [])
        self.assertIn('Unvalidated', result['error'])

    def test_retained_settings_are_exact_and_boundary_peak_is_rejected(self):
        settings = correlation.SETTINGS
        self.assertEqual((settings['minimum_diagnostic_ncc'], settings['minimum_secondary_peak_margin'],
                          settings['distinct_peak_exclusion_s'], settings['near_peak_drop']), (.80, .10, .100, .01))
        values = [1.0]+[0.0]*1000
        self.assertFalse(correlation.peak_evidence(values, settings['methods'][0])['unique'])


def validate_present_fixture_files(root, manifest):
    """Hash every present file before allowing any missing-file skip."""
    missing = []
    for files in manifest['tracks'].values():
        for entry in files.values():
            path = root/entry['path']
            if not path.is_file():
                missing.append(str(path))
            elif digest(path) != entry['sha256']:
                raise AssertionError('Present external fixture hash mismatch: '+str(path))
    return missing


class TestExternalPracticeSteps(unittest.TestCase):
    def test_absent_fixture_has_an_explicit_skip_reason(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {**os.environ, 'SCRB_V3A_PRACTICE_ROOT': str(Path(directory)/'absent')}
            run = subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', str(Path(__file__).parent),
                '-p', 'test_long_correlation.py', '-k', 'test_preserved_hash_bound_practice_tracks', '-v'],
                cwd=Path(__file__).parent, env=env, capture_output=True, text=True, timeout=15)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertIn('skipped', run.stderr)
            self.assertIn('SCRB_V3A_PRACTICE_ROOT', run.stderr)

    def test_partial_absence_cannot_hide_a_present_hash_mismatch(self):
        manifest = json.loads(Path(__file__).with_name('practice_step_fixture.json').read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            one = next(iter(next(iter(manifest['tracks'].values())).values()))
            path = root/one['path']
            path.parent.mkdir(parents=True)
            path.write_bytes(b'invented corrupted fixture; all other files absent')
            with self.assertRaisesRegex(AssertionError, 'Present external fixture hash mismatch'):
                validate_present_fixture_files(root, manifest)

    def test_preserved_hash_bound_practice_tracks(self):
        root = Path(os.environ.get('SCRB_V3A_PRACTICE_ROOT',
                        str(Path(__file__).resolve().parents[3]/'gate3-v3-preflight-20261108')))
        manifest = json.loads(Path(__file__).with_name('practice_step_fixture.json').read_text(encoding='utf-8'))
        missing = validate_present_fixture_files(root, manifest)
        if missing:
            self.skipTest('External invented D2 practice fixture absent; set SCRB_V3A_PRACTICE_ROOT. No audio is committed. Missing: '+missing[0])
        for track, files in manifest['tracks'].items():
            with self.subTest(track=track):
                for entry in files.values():
                    self.assertEqual(digest(root/entry['path']), entry['sha256'], 'Present external fixture hash mismatch')
                source, sr = pcm16(root/files['source']['path'])
                recording, rr = pcm16(root/files['continuous']['path'])
                annotations = json.loads((root/files['annotations']['path']).read_text(encoding='utf-8-sig'))
                clock = json.loads((root/files['clock']['path']).read_text(encoding='utf-8-sig'))
                report = correlation.detect_long_steps(recording, rr, source, sr,
                                correlation.annotation_units(annotations, sr), clock['lead']['position']-1)
                self.assertEqual(report['timing'], 'BOUNDED', report.get('error'))
                self.assertTrue(all(a['unique'] for a in report['anchors']))
                if track == 'meeting':
                    self.assertEqual(len(report['anchors']), 45)
                    self.assertEqual(report['steps'], [])
                else:
                    self.assertEqual(len(report['anchors']), 39)
                    self.assertEqual(len(report['steps']), 1)
                    step = report['steps'][0]
                    self.assertEqual(step['anchors'], ['microphone-019', 'microphone-021'])
                    self.assertGreater(step['signed_change_s'], 0)
                    self.assertLessEqual(step['magnitude_interval_s'][0], .080)
                    self.assertGreaterEqual(step['magnitude_interval_s'][1], .080)
                    self.assertLessEqual(step['location_interval_s'][0], 141.7)
                    self.assertGreaterEqual(step['location_interval_s'][1], 141.7)
                for entry in files.values():
                    self.assertEqual(digest(root/entry['path']), entry['sha256'], 'External input mutated during replay')


if __name__ == '__main__':
    unittest.main()
