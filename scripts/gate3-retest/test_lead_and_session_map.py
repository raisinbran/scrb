"""Tests for the lead-marker first anchor, the observer-to-session mapping (P1-1, P1-3) and overlap placement (P1-2)."""
import copy
import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import observer_session_map as osm  # noqa: E402
import v3a_timing as timing  # noqa: E402
from test_integration_e2e import (CONVERSION_BASIS, FREQ, H0, ORIGIN_NS, SHIFT, harness_events, records)  # noqa: E402

spec = importlib.util.spec_from_file_location("bounds_review", HERE / "analyze-bounds.py")
bounds = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bounds)

CHECK = {'valid': True, 'lead': {'position': 1.004, 'uncertainty_s': 0.003}}


def long_anchor(source_s, offset, name='first', u=0.001):
    return {'id': name, 'source_start_s': source_s, 'source_end_s': source_s + 2,
            'recording_start_s': source_s + offset, 'recording_end_s': source_s + 2 + offset,
            'offset_s': offset, 'uncertainty_s': u, 'method': 'unique-exact-long-PCM', 'validated': True}


class LeadMarkerAnchor(unittest.TestCase):
    def test_offset_and_uncertainty_come_from_both_detections(self):
        anchor = timing.lead_marker_anchor(CHECK, 1.0, 0.005)
        self.assertAlmostEqual(anchor['offset_s'], 0.004)
        self.assertAlmostEqual(anchor['uncertainty_s'], 0.008)
        self.assertEqual(anchor['source_uncertainty_s'], 0.005)
        self.assertEqual((anchor['method'], anchor['validated']), ('lead-marker', True))
        self.assertAlmostEqual(anchor['source_end_s'] - anchor['source_start_s'], 1.2)

    def test_invalid_or_unsupported_marker_check_is_refused(self):
        for check in (None, {}, {'valid': False, 'lead': CHECK['lead']},
                      {'valid': True, 'lead': {'position': float('nan'), 'uncertainty_s': 0.001}},
                      {'valid': True, 'lead': {'position': 1.0, 'uncertainty_s': -1}}):
            with self.assertRaises((ValueError, KeyError, AssertionError)):
                timing.lead_marker_anchor(check, 1.0, 0.005)
        for bad in (-0.001, float('nan')):
            with self.assertRaises((ValueError, AssertionError)):
                timing.lead_marker_anchor(CHECK, 1.0, bad)

    def test_lead_marker_must_be_the_first_anchor(self):
        lead = timing.lead_marker_anchor(CHECK, 1.0, 0.005)
        timing.step_bounds([lead, long_anchor(30, 0.0)], [])
        with self.assertRaises((ValueError, AssertionError)):
            timing.step_bounds([long_anchor(30, 0.0), lead], [])

    def test_step_from_lead_to_first_long_anchor_is_computed(self):
        lead = timing.lead_marker_anchor(CHECK, 1.0, 0.005)
        steps = timing.step_bounds([lead, long_anchor(30, 0.054)], [])
        self.assertEqual(len(steps), 1)
        self.assertAlmostEqual(steps[0]['signed_change_s'], 0.05, places=6)
        self.assertGreaterEqual(steps[0]['symmetric_uncertainty_s'], 0.05)


def build(gap_map=None, **kw):
    gap_map = gap_map or timing.gap_map(records(), 'microphone', 1000, 'c' * 64)
    header = {'type': 'header', 'qpc_frequency': FREQ, 'origin_qpc': H0}
    doc = {'clock_basis': 'harness', 'recording_sha256': 'f' * 64, 'harness_origin_qpc': H0, 'qpc_frequency': FREQ,
           'quarantined_rows': [{'time': '1:00'}],
           'words': [{'id': 'x', 'track': 'microphone', 'observed': 10.0, 'u': 0.1, 'text': 'a'}]}
    args = dict(track='microphone', raw_header=header, harness_events=harness_events(),
                conversion_u_s=0.002, conversion_u_basis=CONVERSION_BASIS)
    args.update(kw)
    return osm.publications_to_timestamped(doc, gap_map, **args), doc, gap_map


class ConversionUncertainty(unittest.TestCase):
    """P1-1: the scorer's interval is [observed - u, observed], so a +/- e error needs observed + e and u + 2e."""

    def test_shift_and_symmetric_widening(self):
        out, _, _ = build()
        word = out['words'][0]
        self.assertAlmostEqual(word['observed'], 10.0 + SHIFT + 0.002, places=9)
        self.assertAlmostEqual(word['u'], 0.1 + 0.004, places=9)
        self.assertAlmostEqual(word['observed'] - word['u'], 10.0 + SHIFT - 0.1 - 0.002, places=9)

    def test_nominal_5_995_with_10_ms_error_is_not_on_time(self):
        earliest_end = 10.0
        def conservative(observed, u):
            unit = {'id': 'u', 'eligible': True, 'outcome': 'MATCHED', 'identity_confirmed': True, 'last_word_start': 9.0,
                    'earliest_acoustic_end_s': earliest_end, 'latest_acoustic_end_s': earliest_end,
                    'endpoints': [{'observed': observed, 'u': u}]}
            return bounds.analyze_unit(unit)
        nominal = earliest_end + 5.995 - SHIFT   # harness seconds
        doc = {'clock_basis': 'harness', 'harness_origin_qpc': H0, 'qpc_frequency': FREQ, 'recording_sha256': 'f' * 64,
               'words': [{'id': 'x', 'track': 'microphone', 'observed': nominal, 'u': 0.05, 'text': 'a'}]}
        header = {'type': 'header', 'qpc_frequency': FREQ, 'origin_qpc': H0}
        mapped = osm.publications_to_timestamped(doc, timing.gap_map(records(), 'microphone', 1000, 'c' * 64),
                                                 track='microphone', raw_header=header, harness_events=harness_events(),
                                                 conversion_u_s=0.010, conversion_u_basis=CONVERSION_BASIS)
        word = mapped['words'][0]
        self.assertAlmostEqual(word['observed'], earliest_end + 5.995 + 0.010, places=9)
        # The old one-sided rule left observed at the nominal value and would have counted this on time.
        self.assertLessEqual(conservative(earliest_end + 5.995, 0.05 + 0.010)['conservative'], 6)
        row = conservative(word['observed'], word['u'])
        self.assertGreater(row['conservative'], 6)
        self.assertLessEqual(row['best'], 6)
        self.assertTrue(row['straddle'])


class EvidenceBinding(unittest.TestCase):
    """P1-3(b): origin, frequency, identity and hashes are verified, recorded, never trusted as arguments."""

    def test_all_evidence_is_recorded(self):
        out, _, gap_map = build()
        c = out['conversion']
        self.assertEqual(c['origin_ns'], ORIGIN_NS)
        self.assertIn('reconstructed effective origin', c['origin_kind'])
        self.assertNotIn('logged', c['origin_kind'])
        self.assertEqual(c['ordered_source_sha256'], ['a' * 64, 'b' * 64])
        self.assertEqual(c['session_id'], 's1')
        self.assertEqual(c['chunks_metadata_sha256'], 'c' * 64)
        self.assertEqual(c['track_identity_sha256'], gap_map['clock_context']['track_identity']['sha256'])
        self.assertEqual((c['observer_header_origin_qpc'], c['observer_header_frequency_hz'], c['harness_log_frequency_hz']),
                         (H0, FREQ, FREQ))
        self.assertEqual(c['conversion_u_basis'], CONVERSION_BASIS)
        for key in ('observer_header_sha256', 'harness_log_sha256'):
            self.assertRegex(c[key], '^[0-9a-f]{64}$')
        self.assertFalse(c['marker_fit_used'])
        self.assertEqual(out['quarantined_rows'], [{'time': '1:00'}])

    def test_logged_origin_must_equal_the_reconstruction(self):
        out, _, _ = build(logged_clock_origin_ns=ORIGIN_NS)
        self.assertIn('logged clockOriginNs', out['conversion']['origin_kind'])
        for value in (ORIGIN_NS + 1, 0, True):
            with self.assertRaises(ValueError):
                build(logged_clock_origin_ns=value)

    def test_conversion_arguments(self):
        for kw in (dict(conversion_u_s=-1), dict(conversion_u_s=float('nan')), dict(conversion_u_s=0.0),
                   dict(conversion_u_s=True), dict(conversion_u_basis=''), dict(conversion_u_basis=None)):
            with self.assertRaises(ValueError, msg=str(kw)):
                build(**kw)

    def test_tampered_evidence_is_refused(self):
        def gm(change):
            g = copy.deepcopy(timing.gap_map(records(), 'microphone', 1000, 'c' * 64))
            change(g)
            return g
        for name, change in {
                'track identity hash': lambda g: g['clock_context']['track_identity'].__setitem__('sha256', '0' * 64),
                'ordered hashes': lambda g: g['clock_context']['track_identity']['ordered_source_sha256'].reverse(),
                'metadata hash': lambda g: g.__setitem__('metadata_sha256', 'd' * 64),
                'chunk count': lambda g: g['clock_context'].__setitem__('origin_evidence_chunks', 1),
                'stored origin': lambda g: g['clock_context'].__setitem__('session_origin_ns', ORIGIN_NS + 1),
                'invalid map': lambda g: g.__setitem__('valid', False),
                'other track': lambda g: g.__setitem__('track', 'meeting')}.items():
            with self.subTest(name), self.assertRaises(ValueError):
                build(gap_map=gm(change))
        with self.assertRaises(ValueError):
            build(track='meeting')

    def test_other_track_words_dropped_and_input_unchanged(self):
        out, doc, _ = build()
        self.assertEqual([w['id'] for w in out['words']], ['x'])
        self.assertEqual(doc['words'][0]['observed'], 10.0)


class OverlapPlacement(unittest.TestCase):
    """P1-2: the placement interval keeps both the continuous and the signed timestamped reading."""

    def overlapped(self):
        rows = [{'seq': 0, 'source_sha256': 'a' * 64, 'start_ns': 0, 'metadata_start_ns': 0,
                 'metadata_end_ns': 10_000_000_000, 'decoded_samples': 10_000},
                {'seq': 1, 'source_sha256': 'b' * 64, 'start_ns': 9_800_000_000, 'metadata_start_ns': 9_800_000_000,
                 'metadata_end_ns': 19_800_000_000, 'decoded_samples': 10_000}]
        return timing.gap_map(rows, 'microphone', 1000, 'c' * 64)

    def test_overlap_moves_the_earliest_placement_earlier(self):
        mapping = self.overlapped()
        self.assertEqual(mapping['chunks'][1]['timestamp_displacement_samples'], -200)
        low, high = timing.placement_interval(10.5, mapping)
        self.assertAlmostEqual(low, 10.3)
        self.assertAlmostEqual(high, 10.5)
        self.assertEqual(timing.placement_interval(5.0, mapping), [5.0, 5.0])

    def test_overlap_word_published_at_16_4_is_not_5_9_s_conservative_latency(self):
        mapping = self.overlapped()
        low, high = timing.placement_interval(10.5, mapping)
        unit = {'id': 'u', 'eligible': True, 'outcome': 'MATCHED', 'identity_confirmed': True, 'last_word_start': 10.0,
                'earliest_acoustic_end_s': low, 'latest_acoustic_end_s': high,
                'endpoints': [{'observed': 16.4, 'u': 0.0}]}
        row = bounds.analyze_unit(unit)
        self.assertAlmostEqual(row['conservative'], 6.1)
        self.assertAlmostEqual(row['best'], 5.9)
        self.assertTrue(row['straddle'])

    def test_negative_displacement_after_a_gap_and_an_overlap(self):
        rows = [{'seq': 0, 'source_sha256': 'a' * 64, 'start_ns': 0, 'metadata_start_ns': 0,
                 'metadata_end_ns': 10_000_000_000, 'decoded_samples': 10_000},
                {'seq': 1, 'source_sha256': 'b' * 64, 'start_ns': 10_500_000_000, 'metadata_start_ns': 10_500_000_000,
                 'metadata_end_ns': 20_500_000_000, 'decoded_samples': 10_000},
                {'seq': 2, 'source_sha256': 'e' * 64, 'start_ns': 20_300_000_000, 'metadata_start_ns': 20_300_000_000,
                 'metadata_end_ns': 30_300_000_000, 'decoded_samples': 10_000}]
        mapping = timing.gap_map(rows, 'microphone', 1000, 'c' * 64)
        self.assertEqual([r['timestamp_displacement_samples'] for r in mapping['chunks']], [0, 500, 300])
        # Chunk 2: displacement +0.3 s but 0.5 s of cumulative gap before it -> [t, t + 0.5], unchanged from gap-only.
        self.assertEqual([round(x, 3) for x in timing.placement_interval(25.0, mapping)], [25.0, 25.5])
        # Chunk 3 with the gap-free overlap only: earlier reading appears.
        rows[1]['start_ns'] = rows[1]['metadata_start_ns'] = 9_800_000_000
        rows[1]['metadata_end_ns'] = 19_800_000_000
        rows[2]['start_ns'] = rows[2]['metadata_start_ns'] = 19_600_000_000
        rows[2]['metadata_end_ns'] = 29_600_000_000
        mapping = timing.gap_map(rows, 'microphone', 1000, 'c' * 64)
        low, high = timing.placement_interval(25.0, mapping)
        self.assertAlmostEqual(low, 24.6)
        self.assertAlmostEqual(high, 25.0)

    def test_gap_only_results_are_unchanged(self):
        mapping = timing.gap_map(records(), 'microphone', 1000, 'c' * 64)
        self.assertEqual(timing.placement_interval(100.0, mapping), [100.0, 100.0])
        low, high = timing.placement_interval(200.0, mapping)
        self.assertEqual(low, 200.0)
        self.assertAlmostEqual(high, 200.21)


if __name__ == '__main__':
    unittest.main()
