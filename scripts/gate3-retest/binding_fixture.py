"""Invented evidence files for tests of the endpoint binding in analyze-bounds.py (no real recordings)."""
import json
from pathlib import Path

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


def write_evidence(root, doc, header, events):
    root = Path(root)
    paths = {'publication_file': root / 'converted.json', 'observer_raw': root / 'observer.jsonl',
             'harness_log': root / 'harness.jsonl'}
    paths['publication_file'].write_text(json.dumps(doc), encoding='utf-8')
    paths['observer_raw'].write_text(json.dumps(header) + '\n' + json.dumps({'type': 'sample'}) + '\n', encoding='utf-8')
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
    return bound, write_evidence(root, doc, header, harness_events())
