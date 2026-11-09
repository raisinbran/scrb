"""End-to-end cross-check on invented data: observer JSONL -> publications -> session timeline ->
occurrence matcher -> v3a timing -> analyze-bounds. No skip paths; only the audio-decoding layer
(views, PCM, long-anchor correlation) is replaced by synthetic stand-ins, as in test_v3a_timing.
Written by Claude Code as an independent check of Codex's matcher and v3a code."""
import importlib.util
import copy
import hashlib
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import binding_fixture  # noqa: E402
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


SOURCE_RATE = 8000
CONVERSION_U = 0.002
CONVERSION_BASIS = "invented fixture: assumed counter agreement within 2 ms"


def source_pcm(marker_at=1.0):
    """Invented source audio: silence with the 880 Hz three-pulse lead marker (200 ms pulses, 500 ms apart)."""
    import array
    samples = array.array('h', [0]) * (12 * SOURCE_RATE)
    for pulse in range(3):
        first = round((marker_at + 0.5 * pulse) * SOURCE_RATE)
        for i in range(round(0.2 * SOURCE_RATE)):
            samples[first + i] = round(12000 * math.sin(2 * math.pi * 880 * i / SOURCE_RATE))
    return samples, SOURCE_RATE


def harness_events():
    return [{"event": "devices", "stamp": {"qpc_ticks": H0 + FREQ // 10, "utc": "x"},
             "data": {"stopwatch_frequency": FREQ}},
            {"event": "microphone_start", "stamp": {"qpc_ticks": H0 + FREQ}, "data": {}}]


def records():
    rows = [{'seq': 0, 'source_sha256': 'a' * 64, 'start_ns': 0, 'metadata_start_ns': 0,
             'metadata_end_ns': 140_000_000_000, 'decoded_samples': 140_000},
            {'seq': 1, 'source_sha256': 'b' * 64, 'start_ns': round((140 + GAP) * 1e9),
             'metadata_start_ns': round((140 + GAP) * 1e9), 'metadata_end_ns': round((440 + GAP) * 1e9),
             'decoded_samples': 300_000}]
    for row in rows:
        row.update(session_id='s1', device_stamp_ns=row['start_ns'] + ORIGIN_NS)
    return rows


def long_anchor(name, source_s, offset, uncertainty=0.001):
    return {'id': name, 'source_start_s': source_s, 'source_end_s': source_s + 2,
            'recording_start_s': source_s + offset, 'recording_end_s': source_s + 2 + offset,
            'offset_s': offset, 'uncertainty_s': uncertainty, 'method': 'unique-exact-long-PCM', 'validated': True}


ANCHORS = [long_anchor('first', 30, 0.0), long_anchor('second', 98, 0.0),
           long_anchor('plus-step', 150, 0.08), long_anchor('minus-step', 300, -0.04)]


def pipeline(units=None, quarantine=True, lead=True, clock_valid=True, evidence_present=True, tamper=None,
             supplied_marker=None, conversion_u=CONVERSION_U, source=None, file_tamper=None, drop_key=None):
    units = units or build_units()
    header, samples = observer_lines(units, quarantine)
    publications, report = op.build_publications(header, samples, op.DEFAULT_LABELS, H0, FREQ)
    doc = {"clock_basis": "harness", "recording_sha256": "f" * 64, "words": publications,
           "harness_origin_qpc": H0, "qpc_frequency": FREQ, "quarantined_rows": report["quarantined_rows"]}
    mapping = timing.gap_map(records(), 'microphone', 1000, 'c' * 64)
    parts = {"doc": doc, "gap_map": copy.deepcopy(mapping), "raw_header": dict(header), "events": harness_events()}
    if tamper:
        tamper(parts)
    mapped = osm.publications_to_timestamped(parts["doc"], parts["gap_map"], track="microphone", raw_header=parts["raw_header"],
                                             harness_events=parts["events"], conversion_u_s=conversion_u,
                                             conversion_u_basis=CONVERSION_BASIS)
    annotations = {"utterances": [{"id": u[0], "reference_words": u[1], "start": u[2], "last_word_start": u[3],
                                   "earliest_acoustic_end_s": u[4], "latest_acoustic_end_s": u[4], "eligible": True}
                                  for u in units]}
    rows = occurrence_matcher.align_occurrences(annotations, mapped["words"], "microphone", clock_basis="recording")
    scored = []
    for row, u in zip(rows, units):
        scored.append({**row, "track": "microphone", "source_start_s": u[2], "source_last_word_start_s": u[3],
                       "source_last_word_end_s": u[4]})
    continuous_check = {'valid': clock_valid, 'lead': {'position': 1.0, 'uncertainty_s': 0.002}}
    clock = {'valid': clock_valid, 'gap_map': mapping, 'sample_continuous': continuous_check,
             'original_timestamped': {'valid': False, 'latency': 'INCONCLUSIVE'}}
    inventory = {'anchors': [dict(a) for a in ANCHORS], 'utterances': [{'id': u[0], 'eligible': True} for u in units],
                 'annotations_sha256': 'd' * 64}
    evidence = {'publication_basis': 'timestamped-capture', 'chunks': 'chunks.json', 'decoder': 'decoder', 'source': 's.wav',
                'harness': [11, 391], 'long_anchors': [{}], 'source_annotations': 'a.json'}
    if lead:
        evidence['lead_marker'] = True
        if supplied_marker is not None:
            evidence['lead_marker_source_s'] = supplied_marker
    with tempfile.TemporaryDirectory() as directory:
        written = copy.deepcopy(mapped)
        header_out, events_out = dict(header), harness_events()
        if file_tamper:
            file_tamper(written, header_out, events_out, scored)
        evidence.update(binding_fixture.write_evidence(directory, written, header_out, events_out, samples))
        published = hashlib.sha256(Path(evidence['publication_file']).read_bytes()).hexdigest()
        evidence.pop(drop_key, None)
        with patch.object(marker_clock, 'analyze_v3a', return_value=clock), \
             patch.object(timing, 'load_views', return_value=([], [], mapping)), \
             patch.object(timing, 'pcm16', return_value=source or source_pcm()), \
             patch.object(timing, 'load_long_anchors', return_value=inventory), \
             patch.object(timing, 'digest', return_value='c' * 64):
            result = bounds.analyze_v3a_track(scored, evidence if evidence_present else None, 'microphone')
        result['_publication_sha256'] = published
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
        self.assertAlmostEqual(high - low, 0.014, places=3)

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

    def test_missing_or_inconsistent_clock_evidence_stops_before_matching(self):
        def drop_origin(parts):
            parts["gap_map"]["clock_context"]["session_origin_ns"] = None

        def wrong_status(parts):
            parts["gap_map"]["clock_context"]["origin_status"] = "INCONSISTENT"

        def other_track(parts):
            parts["gap_map"]["clock_context"]["track_identity"]["track"] = "meeting"

        def empty_context(parts):
            parts["gap_map"]["clock_context"] = {}

        def one_chunk_origin_differs(parts):
            parts["gap_map"]["chunks"][1]["device_stamp_ns"] += 1

        def hash_changed(parts):
            parts["gap_map"]["chunks"][1]["source_sha256"] = "e" * 64

        def session_changed(parts):
            parts["gap_map"]["chunks"][1]["session_id"] = "s2"

        def header_frequency(parts):
            parts["raw_header"]["qpc_frequency"] = FREQ + 1

        def header_origin(parts):
            parts["raw_header"]["origin_qpc"] = H0 + 1

        def log_frequency(parts):
            parts["events"][0]["data"]["stopwatch_frequency"] = FREQ * 2

        def log_before_origin(parts):
            parts["events"][0]["stamp"]["qpc_ticks"] = H0 - 1

        def no_log(parts):
            parts["events"] = []

        for tamper in (drop_origin, wrong_status, other_track, empty_context, one_chunk_origin_differs, hash_changed,
                       session_changed, header_frequency, header_origin, log_frequency, log_before_origin, no_log):
            with self.subTest(tamper=tamper.__name__), self.assertRaises(ValueError):
                pipeline(tamper=tamper)

    def test_matching_converted_file_passes_and_records_hashes(self):
        clean = [u for u in build_units() if u[6] in ('lead', 'rep')]
        result = pipeline(units=clean)[0]
        self.assertEqual(result['latency'], 'PASS', result.get('error'))
        self.assertEqual(result['endpoint_binding_failures'], [])
        for key in ('observer_raw_sha256', 'harness_log_sha256', 'publication_file_sha256'):
            self.assertRegex(result['evidence_hashes'][key], '^[0-9a-f]{64}$')
        self.assertEqual(result['evidence_hashes']['publication_file_sha256'], result['_publication_sha256'])
        self.assertEqual(result['conversion_identity']['origin_ns'], ORIGIN_NS)

    def test_endpoints_that_do_not_match_the_converted_file_are_never_credited(self):
        clean = [u for u in build_units() if u[6] in ('lead', 'rep')]
        target = 'microphone-005'

        # The converted file stays genuine (it must equal the regeneration from the raw samples); the scored
        # endpoint is what drifts away from it.
        def endpoint(scored):
            return next(r for r in scored if r['id'] == target)['endpoints'][0]

        def shifted(doc, header, events, scored):
            endpoint(scored)['observed'] -= 0.5

        def changed_u(doc, header, events, scored):
            endpoint(scored)['u'] += 0.01

        def absent(doc, header, events, scored):
            endpoint(scored)['publication_id'] = 'microphone|9:99|0'

        def within_tolerance(doc, header, events, scored):
            endpoint(scored)['observed'] += 5e-10

        for tamper in (shifted, changed_u, absent):
            with self.subTest(tamper=tamper.__name__):
                result = pipeline(units=clean, file_tamper=tamper)[0]
                row = by_id(result)[target]
                self.assertEqual((row['conservative'], row['best']), (math.inf, math.inf))
                self.assertEqual(result['denominator'], 16)
                self.assertEqual([f['id'] for f in result['endpoint_binding_failures']], [target])
                self.assertNotEqual(result['latency'], 'PASS')
        self.assertEqual(pipeline(units=clean, file_tamper=within_tolerance)[0]['latency'], 'PASS')

    def test_conversion_allowance_below_2_ms_is_refused_larger_is_accepted(self):
        clean = [u for u in build_units() if u[6] in ('lead', 'rep')]
        refused = pipeline(units=clean, conversion_u=0.001)[0]
        self.assertEqual((refused['latency'], refused['bounds']), ('INCONCLUSIVE', None))
        self.assertIn('allowance', refused['error'])
        for value in (0.002, 0.005):
            with self.subTest(conversion_u=value):
                self.assertEqual(pipeline(units=clean, conversion_u=value)[0]['latency'], 'PASS')

    def test_file_and_endpoint_changed_together_do_not_survive_regeneration_from_raw_samples(self):
        clean = [u for u in build_units() if u[6] in ('lead', 'rep')]
        target = 'microphone-005'

        def together(doc, header, events, scored):
            row = next(r for r in scored if r['id'] == target)
            point = row['endpoints'][0]
            word = next(w for w in doc['words'] if w['id'] == point['publication_id'])
            word['observed'] -= 0.75      # the file and the scored endpoint agree with each other...
            point['observed'] -= 0.75     # ...but not with the raw observer samples

        def text_only(doc, header, events, scored):
            doc['words'][3]['text'] = 'edited'

        for tamper in (together, text_only):
            with self.subTest(tamper=tamper.__name__):
                result = pipeline(units=clean, file_tamper=tamper)[0]
                self.assertEqual((result['latency'], result['bounds']), ('INCONCLUSIVE', None))
                self.assertIn('regenerated from the raw observer samples', result['error'])

    def test_document_whose_conversion_identity_does_not_match_never_scores(self):
        clean = [u for u in build_units() if u[6] in ('lead', 'rep')]
        changes = {
            'origin': lambda d, h, e, s: d['conversion'].__setitem__('origin_ns', ORIGIN_NS + 1),
            'chunk hashes': lambda d, h, e, s: d['conversion']['ordered_source_sha256'].reverse(),
            'metadata hash': lambda d, h, e, s: d['conversion'].__setitem__('chunks_metadata_sha256', 'd' * 64),
            'session': lambda d, h, e, s: d['conversion'].__setitem__('session_id', 's2'),
            'track identity': lambda d, h, e, s: d['conversion'].__setitem__('track_identity_sha256', '0' * 64),
            'frequency': lambda d, h, e, s: d['conversion'].__setitem__('observer_header_frequency_hz', FREQ + 1),
            'harness origin': lambda d, h, e, s: d['conversion'].__setitem__('harness_origin_qpc', H0 + 1),
            'conversion u': lambda d, h, e, s: d['conversion'].__setitem__('conversion_u_s', 0.0),
            'other track': lambda d, h, e, s: d.__setitem__('track', 'meeting'),
            'log changed after conversion': lambda d, h, e, s: e[1]['stamp'].__setitem__('qpc_ticks', H0 + FREQ + 1)}
        for name, change in changes.items():
            with self.subTest(change=name):
                result = pipeline(units=clean, file_tamper=change)[0]
                self.assertEqual((result['latency'], result['bounds']), ('INCONCLUSIVE', None))
                self.assertTrue(result['error'])

    def test_missing_binding_paths_never_pass(self):
        clean = [u for u in build_units() if u[6] in ('lead', 'rep')]
        for key in ('publication_file', 'observer_raw', 'harness_log'):
            with self.subTest(key=key):
                result = pipeline(units=clean, drop_key=key)[0]
                self.assertEqual((result['latency'], result['bounds']), ('INCONCLUSIVE', None))
                self.assertIn(key, result['error'])

    def test_missing_conversion_uncertainty_stops(self):
        for value in (0, None, -1, float('nan'), 1 / FREQ / 2):
            with self.subTest(value=value), self.assertRaises(ValueError):
                pipeline(conversion_u=value)

    def test_wrongly_supplied_lead_marker_time_is_rejected_and_the_derived_time_accepted(self):
        good = pipeline(supplied_marker=1.0)[0]
        self.assertEqual(good['units'][0]['outcome'], 'MATCHED')
        bad = pipeline(supplied_marker=1.5)[0]
        self.assertEqual((bad['latency'], bad['bounds']), ('INCONCLUSIVE', None))
        self.assertIn('differs from the one detected in the frozen source file', bad['error'])
        # Had it been accepted, the early unit would have moved by the 0.5 s error and flipped its latency.
        wrong = timing.lead_marker_anchor({'valid': True, 'lead': {'position': 1.0, 'uncertainty_s': 0.002}}, 1.5, 0.005)
        right = timing.lead_marker_anchor({'valid': True, 'lead': {'position': 1.0, 'uncertainty_s': 0.002}}, 1.0, 0.005)
        self.assertAlmostEqual(right['offset_s'] - wrong['offset_s'], 0.5)

    def test_lead_marker_uncertainty_includes_the_source_detection(self):
        result = pipeline()[0]
        anchor = result['long_anchors'][0]
        self.assertEqual(anchor['id'], 'lead-marker')
        self.assertAlmostEqual(anchor['uncertainty_s'], 0.007)
        self.assertAlmostEqual(anchor['source_start_s'], 1.0)

    def test_source_without_a_marker_stops_the_lead_anchor(self):
        import array
        result = pipeline(source=(array.array('h', [0]) * (12 * SOURCE_RATE), SOURCE_RATE))[0]
        self.assertEqual((result['latency'], result['bounds']), ('INCONCLUSIVE', None))


if __name__ == "__main__":
    unittest.main()
