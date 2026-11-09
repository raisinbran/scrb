"""Tests for the lead-marker first anchor (v3a proposal) and the QPC-to-session mapping (observer_session_map)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import observer_session_map as osm  # noqa: E402
import v3a_timing as timing  # noqa: E402

CHECK = {'valid': True, 'lead': {'position': 1.004, 'uncertainty_s': 0.003}}


def long_anchor(source_s, offset, name='first', u=0.001):
    return {'id': name, 'source_start_s': source_s, 'source_end_s': source_s + 2,
            'recording_start_s': source_s + offset, 'recording_end_s': source_s + 2 + offset,
            'offset_s': offset, 'uncertainty_s': u, 'method': 'unique-exact-long-PCM', 'validated': True}


class LeadMarkerAnchor(unittest.TestCase):
    def test_offset_and_uncertainty_come_from_the_marker_check(self):
        anchor = timing.lead_marker_anchor(CHECK, 1.0)
        self.assertAlmostEqual(anchor['offset_s'], 0.004)
        self.assertEqual(anchor['uncertainty_s'], 0.003)
        self.assertEqual((anchor['method'], anchor['validated']), ('lead-marker', True))
        self.assertAlmostEqual(anchor['source_end_s'] - anchor['source_start_s'], 1.2)

    def test_invalid_or_unsupported_marker_check_is_refused(self):
        for check in (None, {}, {'valid': False, 'lead': CHECK['lead']},
                      {'valid': True, 'lead': {'position': float('nan'), 'uncertainty_s': 0.001}},
                      {'valid': True, 'lead': {'position': 1.0, 'uncertainty_s': -1}}):
            with self.assertRaises((ValueError, KeyError, AssertionError)):
                timing.lead_marker_anchor(check, 1.0)

    def test_lead_marker_must_be_the_first_anchor(self):
        lead = timing.lead_marker_anchor(CHECK, 1.0)
        timing.step_bounds([lead, long_anchor(30, 0.0)], [])
        with self.assertRaises((ValueError, AssertionError)):
            timing.step_bounds([long_anchor(30, 0.0), lead], [])

    def test_step_from_lead_to_first_long_anchor_is_computed(self):
        lead = timing.lead_marker_anchor(CHECK, 1.0)
        steps = timing.step_bounds([lead, long_anchor(30, 0.054)], [])
        self.assertEqual(len(steps), 1)
        self.assertAlmostEqual(steps[0]['signed_change_s'], 0.05, places=6)
        self.assertGreaterEqual(steps[0]['symmetric_uncertainty_s'], 0.05)


class SessionMap(unittest.TestCase):
    freq = 10_000_000
    h0 = 50_000_000_000
    ctx = {'schema_version': 1, 'session_origin_ns': h0 * 100 - 2_000_000_000, 'origin_status': 'RECONSTRUCTED_CONSTANT',
           'qpc_basis': {'capture_units': 'ns', 'nanoseconds_per_second': 1_000_000_000},
           'track_identity': {'track': 'microphone'}}

    def doc(self, observed=10.0, track='microphone'):
        return {'clock_basis': 'harness', 'recording_sha256': 'f' * 64, 'quarantined_rows': [{'time': '1:00'}],
                'words': [{'id': 'x', 'track': track, 'observed': observed, 'u': 0.1, 'text': 'a'}]}

    def run_map(self, **kw):
        args = dict(track='microphone', harness_origin_qpc=self.h0, frequency=self.freq, conversion_u_s=0.002)
        args.update(kw)
        return osm.publications_to_timestamped(self.doc(), self.ctx, **args)

    def test_reconstructed_origin_shifts_and_widens(self):
        out = self.run_map()
        self.assertAlmostEqual(out['words'][0]['observed'], 12.0, places=9)
        self.assertAlmostEqual(out['words'][0]['u'], 0.102, places=9)
        self.assertEqual(out['conversion']['origin_method'], 'RECONSTRUCTED_FROM_CHUNK_STAMPS')
        self.assertFalse(out['conversion']['marker_fit_used'])
        self.assertEqual((out['clock_basis'], out['publication_basis']), ('recording', 'timestamped-capture'))
        self.assertEqual(out['quarantined_rows'], [{'time': '1:00'}])

    def test_logged_origin_is_preferred_and_must_agree(self):
        out = self.run_map(logged_clock_origin_ns=self.ctx['session_origin_ns'])
        self.assertEqual(out['conversion']['origin_method'], 'LOGGED_CLOCK_ORIGIN_NS')
        with self.assertRaises(ValueError):
            self.run_map(logged_clock_origin_ns=self.ctx['session_origin_ns'] + 1)
        no_reconstruction = {**self.ctx, 'session_origin_ns': None}
        out = osm.publications_to_timestamped(self.doc(), no_reconstruction, track='microphone',
                                              harness_origin_qpc=self.h0, frequency=self.freq, conversion_u_s=0.0,
                                              logged_clock_origin_ns=self.ctx['session_origin_ns'])
        self.assertAlmostEqual(out['words'][0]['observed'], 12.0, places=9)

    def test_refusals(self):
        bad = [dict(conversion_u_s=-1), dict(conversion_u_s=float('nan')), dict(frequency=0), dict(frequency=1.5),
               dict(harness_origin_qpc=1.5), dict(logged_clock_origin_ns=0), dict(logged_clock_origin_ns=True)]
        for kw in bad:
            with self.assertRaises(ValueError, msg=str(kw)):
                self.run_map(**kw)
        for ctx in ({**self.ctx, 'schema_version': 2}, {**self.ctx, 'qpc_basis': {'capture_units': 'us'}},
                    {**self.ctx, 'origin_status': 'VARIES'}, {**self.ctx, 'session_origin_ns': 1.5}):
            with self.assertRaises(ValueError):
                osm.publications_to_timestamped(self.doc(), ctx, track='microphone', harness_origin_qpc=self.h0,
                                                frequency=self.freq, conversion_u_s=0.0)
        with self.assertRaises(ValueError):
            osm.publications_to_timestamped({**self.doc(), 'clock_basis': 'recording'}, self.ctx, track='microphone',
                                            harness_origin_qpc=self.h0, frequency=self.freq, conversion_u_s=0.0)

    def test_other_track_words_are_dropped_and_input_is_not_modified(self):
        doc = self.doc()
        doc['words'].append({'id': 'y', 'track': 'meeting', 'observed': 3.0, 'u': 0.1, 'text': 'b'})
        out = osm.publications_to_timestamped(doc, self.ctx, track='microphone', harness_origin_qpc=self.h0,
                                              frequency=self.freq, conversion_u_s=0.0)
        self.assertEqual([w['id'] for w in out['words']], ['x'])
        self.assertEqual(doc['words'][0]['observed'], 10.0)


if __name__ == '__main__':
    unittest.main()
