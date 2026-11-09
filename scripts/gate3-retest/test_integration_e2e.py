"""End-to-end cross-check on invented data: observer JSONL -> publications -> session timeline ->
occurrence matcher -> v3a timing -> analyze-bounds. No skip paths; only the audio-decoding layer
(views, PCM, long-anchor correlation) is replaced by synthetic stand-ins, as in test_v3a_timing.
Written by Claude Code as an independent check of Codex's matcher and v3a code."""
import importlib.util
import json
import math
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import marker_clock  # noqa: E402
import observer_publications as op  # noqa: E402
import observer_session_map as osm  # noqa: E402
import occurrence_matcher  # noqa: E402
import v3a_timing as timing  # noqa: E402

spec = importlib.util.spec_from_file_location("bounds_e2e", HERE / "analyze-bounds.py")
bounds = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bounds)

FREQ = 10_000_000
H0 = 50_000_000_000                      # harness origin ticks
SHIFT = 2.0                              # session seconds = harness seconds + SHIFT
ORIGIN_NS = H0 * 1_000_000_000 // FREQ - int(SHIFT * 1e9)
GAP_AT, GAP = 140.0, 0.210               # a 210 ms unassigned gap after continuous second 140
SENTENCE = ["Silver", "trains", "arrive"]
VIEW = [100.0, 100.0, 600.0, 4000.0]


def fmt(seconds):
    return "%d:%02d" % divmod(int(seconds), 60)


def ts(continuous_s):
    """Timestamped capture seconds of a continuous-view second (the gap lies in between)."""
    return continuous_s + (GAP if continuous_s >= GAP_AT else 0.0)


def build_units():
    """(id, words, source start, last word start, last word end, publication latency after end, kind)."""
    units = [("microphone-000", ["Yes"], 5.0, 5.0, 5.4, 1.0, "lead")]
    for i in range(15):
        s = 40 + 9 * i
        units.append(("microphone-%03d" % (i + 1), SENTENCE, s, s + 2, s + 3, 1.5, "rep"))
    units.append(("microphone-016", ["Blue", "lamps", "glow"], 190.0, 192.0, 193.0, 1.5, "quarantined"))
    units.append(("microphone-017", ["Calm", "river", "bends"], 200.0, 202.0, 203.0, 5.5, "boundary-in"))
    units.append(("microphone-018", ["Dark", "forest", "hums"], 210.0, 212.0, 213.0, 6.2, "boundary-out"))
    return units


def observer_lines(units, quarantine=True):
    """Raw observer JSONL records: rows appear at the publication instants; one key collides."""
    header = {"type": "header", "schema": op.RAW_SCHEMA, "qpc_frequency": FREQ, "origin_qpc": H0}
    appear = []
    for uid, words, s, lws, lwe, latency, kind in units:
        # session instant of the publication, then back to the harness clock the observer reads
        end_ts = ts(lwe)  # speech end on the timestamped timeline
        appear.append((uid, kind, words, s, end_ts + latency - SHIFT))
    samples, shown, t = [], [], 0.0
    horizon = max(a[4] for a in appear) + 1.0
    while t < horizon:
        for uid, kind, words, s, when in appear:
            if when <= t and uid not in [x[0] for x in shown]:
                shown.append((uid, kind, words, s, when))
        elements, top = [], 150.0
        for uid, kind, words, s, when in shown:
            clock_text = fmt(s)
            elements += [{"role": "Text", "name": "You", "offscreen": False, "bounds": [110, top - 20, 40, 14]},
                         {"role": "Text", "name": clock_text, "offscreen": False, "bounds": [160, top - 20, 40, 14]},
                         {"role": "Text", "name": " ".join(words), "offscreen": False, "bounds": [110, top, 300, 18],
                          "words": [{"text": w, "bounds": [110 + 60 * i, top, 50, 18]} for i, w in enumerate(words)]}]
            if kind == "quarantined" and quarantine:
                # a second row with the same track and displayed time appears at the same moment
                elements += [{"role": "Text", "name": "You", "offscreen": False, "bounds": [110, top + 40, 40, 14]},
                             {"role": "Text", "name": clock_text, "offscreen": False, "bounds": [160, top + 40, 40, 14]},
                             {"role": "Text", "name": "Other row text", "offscreen": False, "bounds": [110, top + 60, 300, 18],
                              "words": [{"text": w, "bounds": [110 + 60 * i, top + 60, 50, 18]} for i, w in enumerate(["Other", "row", "text"])]}]
                top += 60
            top += 40
        begin = H0 + int(t * FREQ)
        samples.append({"type": "sample", "qpc_begin": begin, "qpc_end": begin + FREQ // 100,
                        "viewport": VIEW, "elements": elements})
        t += 0.1
    return header, samples


def clock_context():
    return {"schema_version": 1, "session_id": "s1", "session_origin_ns": ORIGIN_NS,
            "origin_status": "RECONSTRUCTED_CONSTANT", "origin_evidence_chunks": 2,
            "qpc_basis": {"capture_units": "ns", "nanoseconds_per_second": 1_000_000_000},
            "track_identity": {"track": "microphone"}}


def records():
    return [{'seq': 0, 'source_sha256': 'a' * 64, 'start_ns': 0, 'metadata_start_ns': 0,
             'metadata_end_ns': 140_000_000_000, 'decoded_samples': 140_000},
            {'seq': 1, 'source_sha256': 'b' * 64, 'start_ns': round((140 + GAP) * 1e9),
             'metadata_start_ns': round((140 + GAP) * 1e9), 'metadata_end_ns': round((440 + GAP) * 1e9),
             'decoded_samples': 300_000}]


def long_anchor(name, source_s, offset, uncertainty=0.001):
    return {'id': name, 'source_start_s': source_s, 'source_end_s': source_s + 2,
            'recording_start_s': source_s + offset, 'recording_end_s': source_s + 2 + offset,
            'offset_s': offset, 'uncertainty_s': uncertainty, 'method': 'unique-exact-long-PCM', 'validated': True}


ANCHORS = [long_anchor('first', 30, 0.0), long_anchor('second', 98, 0.0),
           long_anchor('plus-step', 150, 0.08), long_anchor('minus-step', 300, -0.04)]


def pipeline(units=None, quarantine=True, lead=True, clock_valid=True, evidence_present=True, context=None):
    units = units or build_units()
    header, samples = observer_lines(units, quarantine)
    publications, report = op.build_publications(header, samples, op.DEFAULT_LABELS, H0, FREQ)
    doc = {"clock_basis": "harness", "recording_sha256": "f" * 64, "words": publications,
           "quarantined_rows": report["quarantined_rows"]}
    mapped = osm.publications_to_timestamped(doc, clock_context() if context is None else context, track="microphone", harness_origin_qpc=H0,
                                             frequency=FREQ, conversion_u_s=0.002)
    annotations = {"utterances": [{"id": u[0], "reference_words": u[1], "start": u[2], "last_word_start": u[3],
                                   "earliest_acoustic_end_s": u[4], "latest_acoustic_end_s": u[4], "eligible": True}
                                  for u in units]}
    rows = occurrence_matcher.align_occurrences(annotations, mapped["words"], "microphone", clock_basis="recording")
    scored = []
    for row, u in zip(rows, units):
        scored.append({**row, "track": "microphone", "source_start_s": u[2], "source_last_word_start_s": u[3],
                       "source_last_word_end_s": u[4]})
    mapping = timing.gap_map(records(), 'microphone', 1000, 'c' * 64)
    continuous_check = {'valid': clock_valid, 'lead': {'position': 1.0, 'uncertainty_s': 0.002}}
    clock = {'valid': clock_valid, 'gap_map': mapping, 'sample_continuous': continuous_check,
             'original_timestamped': {'valid': False, 'latency': 'INCONCLUSIVE'}}
    inventory = {'anchors': [dict(a) for a in ANCHORS], 'utterances': [{'id': u[0], 'eligible': True} for u in units],
                 'annotations_sha256': 'd' * 64}
    evidence = {'publication_basis': 'timestamped-capture', 'chunks': 'chunks.json', 'decoder': 'decoder', 'source': 's.wav',
                'harness': [11, 391], 'long_anchors': [{}], 'source_annotations': 'a.json'}
    if lead:
        evidence['lead_marker_source_s'] = 1.0
    with patch.object(marker_clock, 'analyze_v3a', return_value=clock), \
         patch.object(timing, 'load_views', return_value=([], [], mapping)), \
         patch.object(timing, 'pcm16', return_value=([], 1000)), \
         patch.object(timing, 'load_long_anchors', return_value=inventory), \
         patch.object(timing, 'digest', return_value='c' * 64):
        result = bounds.analyze_v3a_track(scored, evidence if evidence_present else None, 'microphone')
    return result, rows, report, mapped


def by_id(result):
    return {u['id']: u for u in result['units']}


class EndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result, cls.rows, cls.report, cls.mapped = pipeline()
        cls.units = by_id(cls.result)
        cls.spans = {u['id']: u['last_word_start_interval_s'] for u in cls.result['speech_intervals']}

    def test_matcher_is_present_and_used(self):
        self.assertTrue(callable(occurrence_matcher.align_occurrences))
        self.assertEqual(len(self.rows), 19)

    def test_fifteen_repetitions_each_get_their_own_publication(self):
        reps = [r for r, u in zip(self.rows, build_units()) if u[6] == 'rep']
        self.assertEqual(len(reps), 15)
        self.assertTrue(all(r['outcome'] == 'MATCHED' and r['identity_confirmed'] for r in reps))
        ids = [r['endpoints'][0]['publication_id'] for r in reps]
        self.assertEqual(len(set(ids)), 15)
        for r, u in zip(reps, [x for x in build_units() if x[6] == 'rep']):
            self.assertIn(fmt(u[2]), r['endpoints'][0]['publication_id'])

    def test_quarantined_row_is_never_credited_and_stays_in_the_denominator(self):
        self.assertEqual([q['time'] for q in self.report['quarantined_rows']], ['3:10'])
        self.assertEqual(self.rows[16]['outcome'], 'UNIDENTIFIED')
        self.assertFalse(self.rows[16]['endpoints'])
        unit = self.units['microphone-016']
        self.assertEqual((unit['conservative'], unit['best']), (math.inf, math.inf))
        for name in ('conservative', 'best'):
            self.assertEqual(self.result['bounds'][name]['denominator'], 19)
        self.assertEqual(self.result['denominator'], 19)

    def test_quarantined_row_text_never_reaches_the_publications(self):
        self.assertNotIn('Other', {w.get('text') for w in self.mapped['words']})
        self.assertFalse([w for w in self.mapped['words'] if w['id'].startswith('microphone|3:10|')])

    def test_unit_crossing_the_gap_is_widened_by_the_gap(self):
        width = lambda uid: self.spans[uid][1] - self.spans[uid][0]
        self.assertGreaterEqual(width('microphone-012') - width('microphone-011'), GAP - 0.01)
        u = self.units['microphone-012']
        self.assertGreater(u['conservative'] - u['best'], GAP)

    def test_persistent_steps_of_both_signs_widen_only_between_their_anchors(self):
        signs = [round(step['signed_change_s'], 3) for step in self.result['steps']]
        self.assertEqual(signs[:2], [0.08, -0.12])
        width = lambda uid: self.spans[uid][1] - self.spans[uid][0]
        self.assertAlmostEqual(width('microphone-007'), 0.002, places=3)
        self.assertGreater(width('microphone-013'), 0.2)
        self.assertGreater(width('microphone-014'), width('microphone-007') + 0.3)

    def test_publication_near_six_seconds_is_credited_only_where_the_bound_allows(self):
        credited, straddle = self.units['microphone-017'], self.units['microphone-018']
        self.assertLessEqual(credited['conservative'], 6)
        self.assertGreater(straddle['conservative'], 6)
        self.assertLessEqual(straddle['best'], 6)
        self.assertTrue(straddle['straddle'])
        self.assertEqual(self.result['bounds']['conservative']['within6'], 17)
        self.assertEqual(self.result['bounds']['best']['within6'], 18)

    def test_dirty_run_does_not_pass(self):
        self.assertNotEqual(self.result['latency'], 'PASS')
        self.assertFalse(self.result['bounds']['conservative']['pass'])

    def test_lead_marker_anchors_the_unit_before_the_first_long_anchor(self):
        low, high = self.spans['microphone-000']
        self.assertEqual(self.units['microphone-000']['outcome'], 'MATCHED')
        self.assertAlmostEqual((low + high) / 2, 5.0, places=3)
        self.assertAlmostEqual(high - low, 0.004, places=3)

    def test_without_the_lead_marker_that_unit_is_inconclusive(self):
        result = pipeline(lead=False)[0]
        self.assertEqual(result['latency'], 'INCONCLUSIVE')
        self.assertIn('No preceding long anchor', result['error'])

    def test_clean_run_can_pass(self):
        clean = [u for u in build_units() if u[6] in ('lead', 'rep')]
        result = pipeline(units=clean)[0]
        self.assertEqual(result['latency'], 'PASS', result.get('error'))


class NoClockNoPass(unittest.TestCase):
    def test_missing_evidence(self):
        result = pipeline(evidence_present=False)[0]
        self.assertEqual((result['latency'], result['bounds']), ('INCONCLUSIVE', None))

    def test_invalid_clock_record(self):
        for lead in (True, False):
            result = pipeline(clock_valid=False, lead=lead)[0]
            self.assertEqual((result['latency'], result['bounds']), ('INCONCLUSIVE', None))
            self.assertTrue(result['error'])

    def test_missing_or_wrong_session_origin_stops_before_matching(self):
        for context in ({}, {**clock_context(), 'session_origin_ns': None},
                        {**clock_context(), 'origin_status': 'INCONSISTENT'},
                        {**clock_context(), 'track_identity': {'track': 'meeting'}}):
            with self.assertRaises(ValueError):
                pipeline(context=context)


if __name__ == "__main__":
    unittest.main()
