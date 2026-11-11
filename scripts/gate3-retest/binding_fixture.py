"""Invented evidence files for tests of the endpoint binding in analyze-bounds.py (no real recordings)."""
import json
from pathlib import Path
from unittest.mock import patch

import observer_session_map as osm
import v3a_timing as timing

FREQ = 10_000_000
H0 = 50_000_000_000
SHIFT = 2.0
ORIGIN_NS = H0 * 1_000_000_000 // FREQ - int(SHIFT * 1e9)
BASIS = "invented fixture: assumed counter agreement within 2 ms"


def harness_events():
    return [{"event": "devices", "stamp": {"qpc_ticks": H0 + FREQ // 10, "utc": "x"},
             "data": {"stopwatch_frequency": FREQ}},
            {"event": "microphone_start", "stamp": {"qpc_ticks": H0 + FREQ}, "data": {}}]


def enrich(mapping):
    """The same chunks with the session id and device stamps the clock context needs."""
    rows = [{**{k: v for k, v in r.items() if k in ('seq', 'source_sha256', 'start_ns', 'metadata_start_ns',
                                                     'metadata_end_ns', 'decoded_samples')},
             'session_id': 's1', 'device_stamp_ns': r['start_ns'] + ORIGIN_NS} for r in mapping['chunks']]
    return timing.gap_map(rows, mapping['track'], mapping['rate'], mapping['metadata_sha256'])


def converted_document(mapping, words, track='microphone', e=0.002):
    """A real osm conversion record, whose words are replaced by `words` (already on the session clock)."""
    header = {'type': 'header', 'qpc_frequency': FREQ, 'origin_qpc': H0}
    harness = {'clock_basis': 'harness', 'recording_sha256': 'f' * 64, 'harness_origin_qpc': H0, 'qpc_frequency': FREQ,
               'words': []}
    doc = osm.publications_to_timestamped(harness, mapping, track=track, raw_header=header,
                                          harness_events=harness_events(), conversion_u_s=e, conversion_u_basis=BASIS)
    return {**doc, 'words': words}, header


def matcher_document(doc, rows, track='microphone'):
    """The occurrence matcher's output file layout (occurrence_matcher.main) around the given rows."""
    return {'status': 'OFFLINE_ALIGNMENT_ONLY', 'clock_basis': 'recording', 'input_clock_basis': 'harness',
            'recording_sha256': doc.get('recording_sha256'), 'track': track, 'units': rows}


def write_evidence(root, doc, header, events, samples=None, matcher_rows=None, track='microphone'):
    root = Path(root)
    paths = {'publication_file': root / 'converted.json', 'observer_raw': root / 'observer.jsonl',
             'harness_log': root / 'harness.jsonl', 'matcher_output': root / 'matcher.json'}
    paths['matcher_output'].write_text(json.dumps(matcher_document(doc, matcher_rows or [], track)), encoding='utf-8')
    paths['publication_file'].write_text(json.dumps(doc), encoding='utf-8')
    lines = [header] + (samples if samples is not None else [{'type': 'sample'}])
    paths['observer_raw'].write_text(''.join(json.dumps(x) + '\n' for x in lines), encoding='utf-8')
    paths['harness_log'].write_text('\n'.join(json.dumps(e) for e in events) + '\n', encoding='utf-8')
    return {k: str(v) for k, v in paths.items()}


def bind_units(root, mapping, units, track='microphone'):
    """Give each scored endpoint a publication id, write the matching converted file, return (units, evidence)."""
    words, bound = [], []
    for unit in units:
        points = []
        for index, point in enumerate(unit.get('endpoints') or []):
            identifier = '%s|%s|%d' % (track, unit['id'], index)
            words.append({'id': identifier, 'track': track, 'text': 'w', 'observed': point['observed'], 'u': point['u']})
            points.append({**point, 'publication_id': identifier})
        bound.append({**unit, 'endpoints': points} if points else unit)
    doc, header = converted_document(mapping, words, track)
    rows = [{'id': u['id'], 'outcome': u['outcome'], 'identity_confirmed': True, 'endpoints': u.get('endpoints') or []} for u in bound]
    return bound, write_evidence(root, doc, header, harness_events(), matcher_rows=rows, track=track)


def without_regeneration(bounds_module):
    """For timing tests whose endpoints are invented directly: skip only the regeneration from raw samples.

    The end-to-end tests run the real regeneration; the other binding checks still run here."""
    from contextlib import ExitStack

    class Both:
        def __enter__(self):
            self.stack = ExitStack()
            self.stack.enter_context(patch.object(bounds_module, 'regenerate_converted', return_value=None))
            self.stack.enter_context(patch.object(bounds_module, 'bind_harness_markers', side_effect=lambda e, *a: (
                e.get('harness', [11, 391]), e.get('harness_u', (0, 0)), {'patched': 'invented timing test'})))
            return self

        def __exit__(self, *exc):
            return self.stack.__exit__(*exc)
    return Both()


def sourced(unit):
    """A test unit that carries explicit source endpoints and reference words (a real run requires them)."""
    end = unit.get('source_last_word_end_s', unit.get('continuous_last_word_end_s', unit.get('last_word_end', 1)))
    return {'reference_words': ['x'], 'source_start_s': unit.get('continuous_start_s', unit.get('start', 0)),
            'source_last_word_start_s': unit.get('continuous_last_word_start_s', unit.get('last_word_start', 0)),
            'source_last_word_end_s': end, **unit, 'earliest_acoustic_end_s': end, 'latest_acoustic_end_s': end,
            'last_word_end': end}


def frozen_entry(unit):
    """The frozen annotation entry that exactly matches a test unit's identity and timing fields."""
    entry = {'id': unit['id'], 'eligible': unit['eligible']}
    for key, options in timing.BOUND_UNIT_FIELDS:
        if key in unit and key != 'last_word_end':
            entry[options[0]] = unit[key]
    return entry
