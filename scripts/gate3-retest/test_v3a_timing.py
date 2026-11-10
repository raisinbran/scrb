"""Invented offline evidence for opt-in v3a; original v3 suites stay unchanged."""
import array
import copy
import importlib.util
import json
import io
import subprocess
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import wave

import binding_fixture
import marker_clock
import v3a_timing as timing
from test_analysis import make_unit
from test_marker_clock import make_audio

spec = importlib.util.spec_from_file_location('bounds_v3a', Path(__file__).with_name('analyze-bounds.py'))
bounds = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bounds)


def records(gap=.210, rate=1000):
    return [{'seq': 0, 'source_sha256': 'a'*64, 'start_ns': 0, 'metadata_start_ns': 0,
             'metadata_end_ns': 140_000_000_000, 'decoded_samples': 140*rate},
            {'seq': 1, 'source_sha256': 'b'*64, 'start_ns': round((140+gap)*1e9),
             'metadata_start_ns': round((140+gap)*1e9),
             'metadata_end_ns': round((400+gap)*1e9), 'decoded_samples': 260*rate}]


def mapping(gap=.210, rate=1000):
    return timing.gap_map(records(gap, rate), 'microphone', rate, 'c'*64)


def anchors(change=0):
    # 'before' sits within the 30 s maximum anchor distance of the units placed at 139-140 s.
    return [{'id': 'before', 'source_start_s': 118, 'source_end_s': 120,
             'recording_start_s': 118, 'recording_end_s': 120, 'offset_s': 0,
             'uncertainty_s': .001, 'method': 'unique-exact-long-PCM', 'validated': True},
            {'id': 'after', 'source_start_s': 150-change, 'source_end_s': 152-change,
             'recording_start_s': 150, 'recording_end_s': 152, 'offset_s': change,
             'uncertainty_s': .001, 'method': 'unique-exact-long-PCM', 'validated': True}]


def unit(**changes):
    return make_unit(**{'continuous_start_s': 139, 'continuous_last_word_start_s': 139.9,
                        'continuous_last_word_end_s': 140.1,
                        'endpoints': [{'observed': 146.15, 'u': .01}], **changes})


class TestGapMap(unittest.TestCase):
    def test_measured_gaps_and_opposite_endpoints(self):
        for gap in (.161, .210, .8):
            with self.subTest(gap=gap):
                gapmap = mapping(gap)
                self.assertEqual(gapmap['chunks'][1]['gap_before_samples'], round(gap*1000))
                prepared, _ = timing.prepare_units([unit()], gapmap, anchors())
                row = bounds.analyze_unit(prepared[0])
                self.assertAlmostEqual(row['conservative'], 6.051)
                self.assertAlmostEqual(row['best'], 6.039-gap)
                self.assertTrue(prepared[0]['eligible'])
                self.assertEqual(prepared[0]['outcome'], 'MATCHED')
                self.assertEqual(gapmap['chunks'][1]['source_sha256'], 'b'*64)
                self.assertEqual(gapmap['decoded_samples'], 400000)

    def test_missing_duplicate_inconsistent_records(self):
        bad = []
        missing = records(); del missing[1]['decoded_samples']; bad.append(missing)
        bad.append(records()+[records()[1]])
        bad.append(records()[1:])
        for field, value in [('decoded_samples', 259999), ('start_ns', 140211000000),
                             ('metadata_end_ns', 400209000000), ('seq', 3)]:
            case = records(); case[1][field] = value; bad.append(case)
        for case in bad:
            with self.subTest(case=case), self.assertRaises((ValueError, KeyError)):
                timing.gap_map(case, 'microphone', 1000, 'c'*64)

    def test_initial_and_multiple_gaps(self):
        rows = records()
        for row in rows:
            for key in ('start_ns', 'metadata_start_ns', 'metadata_end_ns'):
                row[key] += 50000000
        m = timing.gap_map(rows, 'meeting', 1000, 'c'*64)
        self.assertEqual(timing.placement_interval(140, m), [140, 140.26])
        self.assertEqual(timing.placement_interval(139.999, m), [139.999, 140.049])

    def test_ogg_tags_duplicate_and_missing(self):
        def ogg(fields):
            packet = b'OpusTags'+(0).to_bytes(4, 'little')+len(fields).to_bytes(4, 'little')
            for field in fields:
                packet += len(field).to_bytes(4, 'little')+field
            return b'OggS'+bytes(22)+bytes([1, len(packet)])+packet
        self.assertEqual(timing.opus_tags(ogg([b'START_NS=0']))['START_NS'], '0')
        with self.assertRaises(ValueError):
            timing.opus_tags(ogg([b'START_NS=0', b'START_NS=1']))
        with self.assertRaises(ValueError):
            timing.opus_tags(b'')


class TestChunkAdapter(unittest.TestCase):
    def test_native_decode_keeps_every_sample_and_validates_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            index = root/'chunks.json'
            def chunk(seq, start):
                fields = [f'SEQUENCE={seq}', f'START_NS={start}', 'RATE=1000']
                packet = b'OpusTags'+(0).to_bytes(4, 'little')+len(fields).to_bytes(4, 'little')
                for value in fields:
                    field = value.encode()
                    packet += len(field).to_bytes(4, 'little')+field
                return b'OggS'+bytes(22)+bytes([1, len(packet)])+packet
            (root/'0.opus').write_bytes(chunk(0, 0))
            (root/'1.opus').write_bytes(chunk(1, 1_210_000_000))
            rows = [{'file': '0.opus', 'seq': 0, 'startNs': 0, 'endNs': 1_000_000_000},
                    {'file': '1.opus', 'seq': 1, 'startNs': 1_210_000_000, 'endNs': 2_210_000_000}]
            meta = {'endNs': 2_210_000_000, 'chunks': rows}
            index.write_text(json.dumps(meta))
            pcm = array.array('h', range(1000))
            output = io.BytesIO()
            with wave.open(output, 'wb') as stream:
                stream.setparams((1, 2, 1000, 0, 'NONE', 'not compressed'))
                stream.writeframes(pcm.tobytes())
            completed = subprocess.CompletedProcess([], 0, stdout=output.getvalue())
            with patch.object(timing.subprocess, 'run', return_value=completed) as decode:
                continuous, timestamped, gapmap = timing.load_views(index, 'decoder', 'meeting')
            self.assertEqual(continuous, pcm+pcm)
            self.assertEqual(timestamped, pcm+array.array('h', [0])*210+pcm)
            self.assertEqual(gapmap['chunks'][1]['decoded_samples'], 1000)
            self.assertNotIn('-ar', decode.call_args.args[0])
            self.assertNotIn('-ac', decode.call_args.args[0])
            for malformed in ({**meta, 'chunks': rows[:1]}, {**meta, 'chunks': rows+rows[:1]},
                              {**meta, 'chunks': [rows[0], {**rows[1], 'endNs': 2_209_000_000}]}):
                index.write_text(json.dumps(malformed))
                with patch.object(timing.subprocess, 'run', return_value=completed):
                    if len(malformed['chunks']) != 2:
                        with self.assertRaises(ValueError):
                            timing.load_views(index, 'decoder', 'meeting')
                    else:
                        _, legacy, invalid = timing.load_views(index, 'decoder', 'meeting')
                        self.assertFalse(invalid['valid'])
                        self.assertEqual(len(legacy), 2210)


class TestContinuousClock(unittest.TestCase):
    def test_both_views_preserve_original_failure(self):
        rate = 8000
        continuous = array.array('h', [0])*(400*rate)
        fragment = make_audio((1,), rate=rate)
        for start in (1, 381):
            continuous[start*rate:(start+2)*rate] = fragment[rate:3*rate]
        for gap in (.161, .210):
            with self.subTest(gap=gap):
                timestamped = continuous[:140*rate]+array.array('h', [0])*round(gap*rate)+continuous[140*rate:]
                with patch.object(timing, 'load_views', return_value=(continuous, timestamped, mapping(gap, rate))):
                    report = marker_clock.analyze_v3a('chunks.json', 'decoder', 'microphone', (11, 391))
                self.assertTrue(report['sample_continuous']['valid'])
                self.assertFalse(report['original_timestamped']['valid'])
                self.assertEqual(report['original_timestamped']['latency'], 'INCONCLUSIVE')
                self.assertNotIn('slope', report['sample_continuous'])
                self.assertAlmostEqual(report['original_timestamped']['offset_disagreement_seconds'], gap, delta=.005)

    def test_same_limit_includes_anchor_uncertainty(self):
        lead = {'position': 1, 'uncertainty_s': .005}
        trail = {'position': 381.08, 'uncertainty_s': .005}
        self.assertTrue(marker_clock.check_continuous_markers(lead, trail, (11, 391))['valid'])
        self.assertFalse(marker_clock.check_continuous_markers(lead, trail, (11, 391), (.01, .01))['valid'])

    def test_invalid_counts_retain_original_measured_marker_result(self):
        rate = 8000
        continuous = array.array('h', [0])*(400*rate)
        fragment = make_audio((1,), rate=rate)
        for start in (1, 381):
            continuous[start*rate:(start+2)*rate] = fragment[rate:3*rate]
        legacy = continuous[:140*rate]+array.array('h', [0])*1680+continuous[140*rate:]
        invalid = {**mapping(.210, rate), 'valid': False, 'error': 'Inconsistent sample count',
                   'original_view_basis': 'original-v3 legacy adapter'}
        with patch.object(timing, 'load_views', return_value=(continuous, legacy, invalid)):
            report = marker_clock.analyze_v3a('chunks.json', 'decoder', 'microphone', (11, 391))
        self.assertFalse(report['valid'])
        self.assertTrue(report['sample_continuous']['valid'])
        self.assertIn('lead', report['original_timestamped'])
        self.assertAlmostEqual(report['original_timestamped']['offset_disagreement_seconds'], .210, delta=.005)
        self.assertEqual(report['original_timestamped']['latency'], 'INCONCLUSIVE')

    def test_invalid_gap_records_cannot_pass_marker_mode(self):
        for reason in ('Missing count', 'Duplicated timestamp', 'Inconsistent count'):
            with patch.object(timing, 'load_views', side_effect=ValueError(reason)):
                result = marker_clock.analyze_v3a('chunks.json', 'decoder', 'meeting', (11, 391))
            self.assertFalse(result['valid'])
            self.assertEqual(result['latency'], 'INCONCLUSIVE')


class TestSteps(unittest.TestCase):
    def test_eighty_ms_step_widens_both_directions(self):
        for change in (.080, -.080):
            prepared, steps = timing.prepare_units([unit()], mapping(), anchors(change))
            row = prepared[0]
            self.assertAlmostEqual(steps[0]['symmetric_uncertainty_s'], .082)
            self.assertAlmostEqual(row['earliest_acoustic_end_s'], 140.1-.083)
            self.assertAlmostEqual(row['latest_acoustic_end_s'], 140.31+.083)
            self.assertAlmostEqual(row['last_word_start_interval_s'][0], 139.9-.083)
            self.assertAlmostEqual(row['last_word_start_interval_s'][1], 139.9+.083)

    def test_favorable_only_widening_cannot_create_pass(self):
        u = unit(endpoints=[{'observed': 143.14, 'u': 0}])
        prepared, _ = timing.prepare_units([u], mapping(), anchors(.080))
        result = bounds.summarize_track(prepared)
        self.assertEqual(result['latency'], 'INCONCLUSIVE')
        self.assertGreater(result['units'][0]['conservative'], 3)
        self.assertLess(result['units'][0]['best'], 3)

    def test_unbounded_or_unvalidated_step_is_rejected(self):
        for aa in ([], anchors()[:1], [{**a, 'validated': False} for a in anchors()], anchors()[::-1]):
            with self.subTest(anchors=aa), self.assertRaises(ValueError):
                timing.prepare_units([unit()], mapping(), aa)
        with self.assertRaises(ValueError):
            timing.prepare_units([unit(continuous_last_word_end_s=160)], mapping(), anchors(.08))

    def test_next_anchor_limits_widening(self):
        aa = anchors(.08)+[{'id': 'third', 'source_start_s': 198-.08, 'source_end_s': 200-.08,
                           'recording_start_s': 198, 'recording_end_s': 200, 'offset_s': .08,
                           'uncertainty_s': .001, 'method': 'unique-exact-long-PCM', 'validated': True}]
        prepared, _ = timing.prepare_units([unit(continuous_start_s=160,
            continuous_last_word_start_s=161, continuous_last_word_end_s=162)], mapping(), aa)
        self.assertEqual(prepared[0]['step_uncertainty_s'], 0)
        self.assertEqual(prepared[0]['timing_anchor_id'], 'after')
        self.assertAlmostEqual(prepared[0]['timing_anchor_offset_s'], .08)
        self.assertAlmostEqual(prepared[0]['earliest_acoustic_end_s'], 162.08-.001)

    def test_detects_step_from_actual_long_matches(self):
        rate = 1000
        source = array.array('h', [(i*i+7*i)%30000 for i in range(6000)])
        recording = source[:3000]+array.array('h', [0])*80+source[3000:]
        aa = []
        for name, start, end, left, right in [('before', 0, 2000, 0, 2200),
                                               ('after', 4000, 6000, 3800, 6080)]:
            aa.append(timing.match_long(recording, source, rate,
                {'id': name, 'short': False, 'source_start_sample': start, 'source_end_sample': end,
                 'search_start_sample': left, 'search_end_sample': right}))
        steps = timing.step_bounds(aa, [])
        self.assertAlmostEqual(steps[0]['signed_change_s'], .080)
        self.assertEqual(steps[0]['location_interval_s'], [1.999, 4.081])
        self.assertAlmostEqual(steps[0]['symmetric_uncertainty_s'], .082)

    def test_complete_inventory_prevents_skipping_immediate_long_neighbor(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'annotations.json'
            source = array.array('h', range(6000))
            utterances = [{'id': str(i), 'short': False, 'eligible': True, 'source_start_sample': i*2000,
                           'source_end_sample': (i+1)*2000} for i in range(3)]
            path.write_text(json.dumps({'frozen': True, 'sample_rate': 1000,
                'source_sha256': 'a'*64, 'utterances': utterances}))
            searches = [{'id': str(i), 'search_start_sample': i*2000,
                         'search_end_sample': (i+1)*2000} for i in range(3)]
            aa = timing.load_long_anchors(source, source, 1000, searches, path, 'a'*64)
            self.assertEqual(len(aa['anchors']), 3)
            with self.assertRaisesRegex(ValueError, 'immediate brackets'):
                timing.load_long_anchors(source, source, 1000, searches[::2], path, 'a'*64)
            with self.assertRaisesRegex(ValueError, 'Unbound source'):
                timing.load_long_anchors(source, source, 1000, searches, path, 'b'*64)

    def test_persistent_signed_shift_after_anchor_cannot_credit_false_six_seconds(self):
        for change in (-.080, .080):
            aa = []
            for identity, start, offset in [('before', 100, 0), ('after', 150, change), ('later', 210, change)]:
                aa.append({'id': identity, 'source_start_s': start, 'source_end_s': start+2,
                    'recording_start_s': start+offset, 'recording_end_s': start+2+offset,
                    'offset_s': offset, 'uncertainty_s': .001,
                    'method': 'unique-exact-long-PCM', 'validated': True})
            u = unit(source_start_s=200, source_last_word_start_s=204, source_last_word_end_s=205,
                     endpoints=[{'observed': 210.98, 'u': 0}])
            prepared, _ = timing.prepare_units([u], mapping(gap=0), aa)
            row = bounds.analyze_unit(prepared[0])
            self.assertEqual(prepared[0]['timing_anchor_id'], 'after')
            self.assertEqual(prepared[0]['step_uncertainty_s'], 0)
            self.assertAlmostEqual(prepared[0]['earliest_acoustic_end_s'], 205+change-.001)
            self.assertAlmostEqual(prepared[0]['latest_acoustic_end_s'], 205+change+.001)
            if change < 0:
                self.assertGreater(row['best'], 6)
                self.assertAlmostEqual(row['conservative'], 6.061)
            else:
                self.assertLess(row['conservative'], 6)
                self.assertAlmostEqual(row['conservative'], 5.901)

    def test_unique_exact_long_match_and_negative_controls(self):
        source = array.array('h', [(i*i+7*i)%30000 for i in range(3000)])
        recording = array.array('h', [0])*500+source+array.array('h', [0])*500
        anchor = {'id': 'long', 'short': False, 'source_start_sample': 0, 'source_end_sample': 1200,
                  'search_start_sample': 0, 'search_end_sample': 4000}
        match = timing.match_long(recording, source, 1000, anchor)
        self.assertAlmostEqual(match['offset_s'], .5)
        with self.assertRaisesRegex(ValueError, 'Short-word'):
            timing.match_long(recording, source, 1000, {**anchor, 'short': True})
        with self.assertRaisesRegex(ValueError, 'missing or ambiguous'):
            timing.match_long(recording+recording, source, 1000, {**anchor, 'search_end_sample': 8000})
        recording[600] += 1
        with self.assertRaisesRegex(ValueError, 'missing or ambiguous'):
            timing.match_long(recording, source, 1000, anchor)


class TestScoringGuards(unittest.TestCase):
    def score(self, units, inventory=None, duplicate=False):
        units = [binding_fixture.sourced({**u, 'id': str(i) if not duplicate else 'same'}) for i, u in enumerate(units)]
        if inventory is None:
            inventory = [binding_fixture.frozen_entry({**u, 'eligible': True}) for u in units]
        inventory_report = {'anchors': anchors(), 'utterances': inventory, 'annotations_sha256': 'd'*64}
        m = binding_fixture.enrich(mapping())
        with tempfile.TemporaryDirectory() as directory:
            units, files = binding_fixture.bind_units(directory, m, units)
            clock = {'valid': True, 'gap_map': m, 'original_timestamped': {'valid': False, 'latency': 'INCONCLUSIVE'}}
            evidence = {'publication_basis': 'timestamped-capture', 'chunks': 'chunks.json',
                        'decoder': 'decoder', 'source': 'source.wav', 'harness': [11, 391],
                        'long_anchors': [{}, {}], 'source_annotations': 'annotations.json', **files}
            with patch.object(marker_clock, 'analyze_v3a', return_value=clock), \
                 patch.object(timing, 'load_views', return_value=([], [], m)), \
                 patch.object(timing, 'pcm16', return_value=([], 1000)), \
                 patch.object(timing, 'load_long_anchors', return_value=inventory_report), \
                 patch.object(timing, 'digest', return_value='c'*64), \
                 binding_fixture.without_regeneration(bounds):
                return bounds.analyze_v3a_track(units, evidence, 'microphone')

    def test_crossing_gap_near_six_seconds_keeps_denominator(self):
        # Every unit's scored word overlaps the 140 s capture gap, so none is timed (proposed policy, owner approval pending):
        # no credit in the conservative bound, the best case may credit them, the denominator stays 20, and Layer A is not a FAIL.
        result = self.score([unit(), unit()]+[unit(endpoints=[{'observed': 142, 'u': .01}]) for _ in range(18)])
        self.assertEqual(result['latency'], 'INCONCLUSIVE')
        self.assertEqual(result['denominator'], 20)
        self.assertEqual(len(result['timing_inconclusive_units']), 20)
        self.assertEqual(result['bounds']['conservative']['within6'], 0)
        self.assertEqual(result['bounds']['best']['within6'], 20)
        self.assertEqual(result['clocks']['original_timestamped']['latency'], 'INCONCLUSIVE')

    def test_last_word_start_interval_prevents_false_presence(self):
        result = self.score([unit(continuous_last_word_start_s=140,
                                  endpoints=[{'observed': 140.15, 'u': .01}])])
        # The word's last-word start interval reaches across the 140 s gap, so the unit is timing-INCONCLUSIVE and the observation
        # at 140.15 s earns no presence credit (before: the PRE-SPEECH assertion fired; that path now needs a non-gap unit).
        self.assertEqual(result['latency'], 'INCONCLUSIVE')
        self.assertEqual([u['id'] for u in result['timing_inconclusive_units']], ['0'])
        self.assertEqual(result['bounds']['conservative']['within6'], 0)
        self.assertEqual(result['denominator'], 1)

    def test_gap_never_grants_setup_or_exclusion(self):
        for u in (unit(outcome='SETUP-AFFECTED'), unit(eligible=False)):
            result = self.score([u])
            self.assertEqual(result['latency'], 'INCONCLUSIVE')
            self.assertIsNone(result['bounds'])

    def test_frozen_denominator_cannot_be_bypassed_by_labels_or_omission(self):
        excluded = unit(eligible=False, eligibility_basis='frozen-source-ineligible')
        result = self.score([excluded]+[unit(endpoints=[{'observed': 142, 'u': .01}]) for _ in range(19)])
        self.assertEqual(result['latency'], 'INCONCLUSIVE')
        self.assertEqual(result['denominator'], 20)
        result = self.score([unit()], inventory=[{'id': '0', 'eligible': True}, {'id': '1', 'eligible': True}])
        self.assertEqual(result['latency'], 'INCONCLUSIVE')
        self.assertEqual(result['denominator'], 2)
        self.assertEqual(self.score([unit(), unit()], duplicate=True)['latency'], 'INCONCLUSIVE')

    def test_missing_v3a_evidence_never_passes(self):
        self.assertEqual(bounds.analyze_v3a_track([unit()], None, 'microphone')['latency'], 'INCONCLUSIVE')

    def test_cli_mode_is_explicit_and_defaults_to_v3(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = {'frozen': True, 'units': [make_unit(track=t) for t in ('meeting', 'microphone')],
                    'clocks': {t: bounds.fit_clock(1, 381, 11, 391) for t in ('meeting', 'microphone')}}
            (root/'input.json').write_text(json.dumps(data))
            results = []
            for name, arguments in [('default', []), ('v3', ['--mode', 'v3']), ('v3a', ['--mode', 'v3a'])]:
                subprocess.run([sys.executable, str(Path(__file__).with_name('analyze-bounds.py')),
                                str(root/'input.json'), str(root/(name+'.json')), *arguments], check=True)
                results.append(json.loads((root/(name+'.json')).read_text()))
            self.assertEqual(results[0], results[1])
            self.assertEqual(results[0]['meeting']['latency'], 'PASS')
            self.assertEqual(results[2]['meeting']['latency'], 'INCONCLUSIVE')

    def test_default_v3_behavior_remains_separate(self):
        valid = bounds.fit_clock(1, 381, 11, 391)
        self.assertEqual(bounds.analyze_track([make_unit()], valid)['latency'], 'PASS')
        self.assertFalse(marker_clock.fit_markers({'position': 1, 'uncertainty_s': .005},
            {'position': 381.210, 'uncertainty_s': .005}, (11, 391))['valid'])


if __name__ == '__main__':
    unittest.main()
