"""Conditional v3a review fixes: persistent offsets, audited spans and clock fields."""
import array
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import binding_fixture
import marker_clock
import v3a_timing as timing
from long_correlation import annotation_units, detect_long_steps
from test_marker_clock import make_audio
from test_v3a_timing import records, unit, bounds, mapping


class TestPersistentPrefixAndGapBounds(unittest.TestCase):
    def test_right_anchor_prefix_has_separate_start_and_end_step_bounds(self):
        for change in (-.08, .08):
            anchors = []
            for name, begin, offset in [('before', 1, 0), ('after', 10, change)]:
                anchors.append({'id':name, 'source_start_s':begin+.1, 'source_end_s':begin+3.118,
                    'source_utterance_start_s':begin, 'source_utterance_end_s':begin+4,
                    'recording_start_s':begin+.1+offset, 'recording_end_s':begin+3.118+offset,
                    'offset_s':offset, 'uncertainty_s':.001, 'validated':True, 'unique':True,
                    'method':'bounded-long-correlation', 'methods':[{'unique':True}]*3})
            units = [unit(id='before', source_start_s=1, source_last_word_start_s=4.8,
                          source_last_word_end_s=5, outcome='UNIDENTIFIED'),
                     unit(id='after', source_start_s=10, source_last_word_start_s=10.01,
                          source_last_word_end_s=14, endpoints=[{'observed':10.06+change, 'u':0}])]
            gapmap = mapping(gap=0)
            prepared, _ = timing.prepare_units(units, gapmap, anchors)
            right = prepared[1]
            self.assertAlmostEqual(right['last_word_start_step_uncertainty_s'], .082)
            self.assertEqual(right['speech_end_step_uncertainty_s'], 0)
            self.assertLessEqual(right['last_word_start_interval_s'][0], 10.01)
            self.assertGreaterEqual(right['last_word_start_interval_s'][1], 10.01)
            self.assertAlmostEqual(right['earliest_acoustic_end_s'], 14+change-.001)
            report = {'anchors':anchors, 'utterances':[{'id':u['id'], 'eligible':True} for u in units],
                      'annotations_sha256':'d'*64}
            gapmap = binding_fixture.enrich(gapmap)
            with tempfile.TemporaryDirectory() as directory:
                units, files = binding_fixture.bind_units(directory, gapmap, units)
                evidence = {'publication_basis':'timestamped-capture', 'chunks':'index', 'decoder':'decoder',
                            'source':'source', 'source_annotations':'annotations', 'harness':[11,391],
                            'long_anchors':[{'id':a['id']} for a in anchors], **files}
                with patch.object(timing, 'load_views', return_value=([],[],gapmap)), \
                     patch.object(marker_clock, 'analyze_v3a', return_value={'valid':True}), \
                     patch.object(timing, 'pcm16', return_value=([],1000)), \
                     patch.object(timing, 'digest', return_value='a'*64), \
                     patch.object(timing, 'load_long_anchors', return_value=report), \
                     binding_fixture.without_regeneration(bounds):
                    result = bounds.analyze_v3a_track(units, evidence, 'microphone')
            self.assertEqual(result['latency'], 'INCONCLUSIVE')
            self.assertIn('PRE-SPEECH', result['error'])
            self.assertEqual(result['denominator'], 2)

    def test_last_word_start_uncertainty_crossing_gap_includes_gap(self):
        anchors = [{'id':name, 'source_start_s':start, 'source_end_s':start+2,
                    'recording_start_s':start, 'recording_end_s':start+2, 'offset_s':0,
                    'uncertainty_s':.002, 'method':'unique-exact-long-PCM', 'validated':True}
                    for name,start in [('before',100),('after',160)]]
        u = unit(source_start_s=139, source_last_word_start_s=139.999, source_last_word_end_s=140.1)
        result, _ = timing.prepare_units([u], mapping(.21), anchors)
        self.assertGreaterEqual(result[0]['last_word_start_interval_s'][1], 140.211)


class TestAuditedGapReader(unittest.TestCase):
    def native_records(self):
        rows = [{'seq': i, 'source_sha256': f'{i+1:064x}', 'start_ns': i*1000000000,
                 'metadata_start_ns': i*1000000000, 'metadata_end_ns': (i+1)*1000000000,
                 'decoded_samples': 48000} for i in range(33)]
        rows[-1].update(source_sha256='86198be2632f2435a0044ee702401601a9d1e5af520916186b738a6d8d9f4571',
                        metadata_end_ns=32990000000, decoded_samples=47688)
        return rows

    def test_only_identity_bound_audited_168_samples_are_allowed(self):
        meta = 'c99682505f904e801d9f288d963f4407ca1a2eb39d092eebb8efc3b6afd87290'
        rows = self.native_records()
        result = timing.gap_map(rows, 'microphone', 48000, meta)
        self.assertTrue(result['valid'])
        self.assertEqual(result['audited_overrun_samples'], 168)
        self.assertEqual(result['chunks'][-1]['decoded_overrun_samples'], 168)
        self.assertEqual(result['decoded_samples'], 32*48000+47688)
        for field, value in [('decoded_samples', 47689), ('decoded_samples', 47687), ('source_sha256', 'f'*64)]:
            bad = self.native_records(); bad[-1][field] = value
            with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, 'outside audited'):
                timing.gap_map(bad, 'microphone', 48000, meta)
        with self.assertRaises(ValueError):
            timing.gap_map(rows, 'microphone', 48000, 'f'*64)

    def test_overlaps_are_explicit_and_never_negative_gaps(self):
        rows = records(gap=0)
        for key in ('start_ns', 'metadata_start_ns', 'metadata_end_ns'):
            rows[1][key] -= 32000000
        result = timing.gap_map(rows, 'microphone', 1000, 'c'*64)
        self.assertEqual(result['chunks'][1]['overlap_before_samples'], 32)
        self.assertEqual(result['chunks'][1]['gap_before_samples'], 0)
        self.assertEqual(result['chunks'][1]['cumulative_gap_samples'], 0)
        self.assertEqual(result['decoded_samples'], 400000)
        rows[1]['start_ns'] = rows[0]['start_ns']
        rows[1]['metadata_start_ns'] = rows[0]['start_ns']
        rows[1]['metadata_end_ns'] = 260000000000
        with self.assertRaises(ValueError):
            timing.gap_map(rows, 'microphone', 1000, 'c'*64)


class TestClockCarrySchema(unittest.TestCase):
    def test_origin_basis_and_track_identity_reach_clock_and_gap_reports(self):
        rate = 8000
        rows = records(gap=.210, rate=rate)
        for r in rows:
            r.update(session_id='invented-session', device_stamp_ns=123000000000+r['start_ns'])
        mapping = timing.gap_map(rows, 'microphone', rate, 'c'*64)
        context = mapping['clock_context']
        self.assertEqual(context['session_origin_ns'], 123000000000)
        self.assertEqual(context['origin_status'], 'RECONSTRUCTED_CONSTANT')
        self.assertEqual(context['qpc_basis']['capture_units'], 'ns')
        self.assertEqual(context['qpc_basis']['nanoseconds_per_second'], 1000000000)
        self.assertIsNone(context['qpc_basis']['raw_qpc_frequency_hz'])
        self.assertEqual(context['observer_to_scorer_integration'], 'NOT_IMPLEMENTED')
        self.assertEqual(context['track_identity']['track'], 'microphone')
        continuous = array.array('h', [0])*(400*rate)
        fragment = make_audio((1,), rate=rate)
        for start in (1, 381):
            continuous[start*rate:(start+2)*rate] = fragment[rate:3*rate]
        timestamped = continuous[:140*rate]+array.array('h', [0])*1680+continuous[140*rate:]
        with patch.object(timing, 'load_views', return_value=(continuous, timestamped, mapping)):
            report = marker_clock.analyze_v3a('chunks.json', 'decoder', 'microphone', (11, 391))
        self.assertEqual(report['schema_version'], 2)
        self.assertEqual(report['clock_context'], context)
        self.assertEqual(report['track_identity'], context['track_identity'])
        for key in ('sample_continuous', 'original_timestamped'):
            self.assertEqual(report[key]['clock_context'], context)
            self.assertEqual(report[key]['view_identity']['track_identity_sha256'], context['track_identity']['sha256'])
        self.assertNotEqual(report['sample_continuous']['view_identity']['pcm16le_sha256'],
                            report['original_timestamped']['view_identity']['pcm16le_sha256'])
        rows[1]['device_stamp_ns'] += 1
        inconsistent = timing.capture_clock_fields(rows, 'microphone', 'c'*64)
        self.assertIsNone(inconsistent['session_origin_ns'])
        self.assertEqual(inconsistent['origin_status'], 'UNAVAILABLE_OR_INCONSISTENT')
        different = timing.capture_clock_fields(rows, 'meeting', 'c'*64)
        self.assertNotEqual(different['track_identity']['sha256'], context['track_identity']['sha256'])


class TestRawPracticeMicrophone(unittest.TestCase):
    def test_native_v3a_clock_and_timing_pipeline_no_count_inconclusive(self):
        root = Path(os.environ.get('SCRB_V3A_PRACTICE_ROOT',
                         str(Path(__file__).resolve().parents[3]/'gate3-v3-preflight-20261108')))
        manifest = json.loads(Path(__file__).with_name('practice_step_fixture.json').read_text(encoding='utf-8'))
        raw = manifest['raw_microphone']
        files = [raw[k] for k in ('metadata', 'decoder', 'marker_context')]+raw['chunks']+list(manifest['tracks']['microphone'].values())
        missing = []
        for entry in files:
            path = root/entry['path']
            if not path.is_file():
                missing.append(str(path))
            else:
                self.assertEqual(timing.digest(path), entry['sha256'], 'Present raw practice fixture hash mismatch')
        if missing:
            self.skipTest('Raw external D2 microphone fixture/decoder absent; set SCRB_V3A_PRACTICE_ROOT. Missing: '+missing[0])
        context = json.loads((root/raw['marker_context']['path']).read_text())['microphone']
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)/'native-clock.json'
            run = subprocess.run([sys.executable, str(Path(__file__).with_name('marker_clock.py')),
                str(root/raw['metadata']['path']), str(output), '--mode', 'v3a', '--track', 'microphone',
                '--decoder', str(root/raw['decoder']['path']), '--harness',
                *map(str, context['harness_marker_anchors_s']), '--harness-u',
                *map(str, [context['harness_anchor_uncertainty_s']]*2)],
                capture_output=True, text=True, timeout=300)
            self.assertEqual(run.returncode, 0, run.stderr)
            clock = json.loads(output.read_text(encoding='utf-8'))
        self.assertTrue(clock['valid'])
        mapping = clock['gap_map']
        self.assertTrue(mapping['valid'])
        self.assertEqual(mapping['audited_overrun_samples'], 168)
        self.assertEqual(len(mapping['chunks']), 139)
        self.assertEqual(clock['original_timestamped']['latency'], 'INCONCLUSIVE')
        self.assertEqual(clock['clock_context']['session_origin_ns'], raw['expected_origin_ns'])
        source, sr = timing.pcm16(root/manifest['tracks']['microphone']['source']['path'])
        continuous, rr = timing.pcm16(root/manifest['tracks']['microphone']['continuous']['path'])
        self.assertEqual(hashlib.sha256(continuous.tobytes()).hexdigest(), clock['sample_continuous']['view_identity']['pcm16le_sha256'])
        annotations = json.loads((root/manifest['tracks']['microphone']['annotations']['path']).read_text())
        matched = detect_long_steps(continuous, rr, source, sr, annotation_units(annotations, sr),
                                   clock['sample_continuous']['lead']['position']-1)
        self.assertEqual(matched['timing'], 'BOUNDED')
        units = [{'id':u['id'], 'eligible':u['eligible'], 'source_start_s':u['start'],
                  'source_last_word_start_s':u['last_word_start'], 'source_last_word_end_s':u['acoustic_end'],
                  'outcome':'UNIDENTIFIED'} for u in annotations['utterances']]
        # The prefix is not discarded or scored on a future anchor. Its unsupported
        # timing keeps the complete denominator and blocks actual track acceptance.
        self.assertEqual(units[0]['id'], 'microphone-000')
        with self.assertRaisesRegex(ValueError, 'No preceding long anchor'):
            timing.prepare_units(units, mapping, matched['anchors'])
        prepared, steps = timing.prepare_units(units[1:], mapping, matched['anchors'])
        self.assertEqual(len(prepared), 64)
        later = next(u for u in prepared if u['id'] == 'microphone-022')
        self.assertEqual(later['timing_anchor_id'], 'microphone-021')
        self.assertGreater(later['timing_anchor_offset_s'], 3.75)
        self.assertEqual(later['step_uncertainty_s'], 0)
        report_path = os.environ.get('SCRB_V3A_NATIVE_REPORT')
        if report_path:
            with Path(report_path).open('x', encoding='utf-8') as stream:
                json.dump({'clock':clock, 'long_anchors':matched['anchors'], 'prepared_units':prepared, 'steps':steps,
                  'source_denominator':len(units), 'source_annotations_status':annotations.get('status', 'unavailable'), 'unsupported_units':[{'id':'microphone-000', 'reason':'No preceding long anchor'}],
                  'timing_pipeline':'NATIVE_READER_CLOCK_AND_SUPPORTED_UNITS_READY; NO COUNT INCONCLUSIVE',
                  'acceptance':'INCONCLUSIVE first short unit has no preceding anchor; no latency score or freeze performed'},
                  stream, indent=2, allow_nan=False)
        for entry in files:
            self.assertEqual(timing.digest(root/entry['path']), entry['sha256'], 'Raw practice input changed')


if __name__ == '__main__':
    unittest.main()
