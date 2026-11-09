"""Compute protocol bounds from independently adjudicated publication endpoints."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import statistics
import subprocess
import sys


def analyze_unit(unit):
    """Keep every eligible unit and reject pre-speech publication credit."""
    outcome = unit["outcome"]
    assert outcome in {"MATCHED", "MATCHED-SUBSTITUTED", "UNIDENTIFIED", "BOUNDED", "SETUP-AFFECTED"}
    if outcome == "UNIDENTIFIED":
        return {"id": unit["id"], "conservative": math.inf, "best": math.inf, "outcome": outcome}
    if outcome == "SETUP-AFFECTED":
        return {"id": unit["id"], "conservative": math.inf, "best": -math.inf, "outcome": outcome}
    assert unit.get("identity_confirmed") is True
    if outcome == "MATCHED-SUBSTITUTED":
        assert unit["reference_word_count"] >= 3 and unit["other_words_exact_fraction"] >= 0.6
        assert unit["identity_unique"] is True
    endpoints = unit["endpoints"]
    assert endpoints
    assert all(point["u"] >= 0 for point in endpoints)
    assert all(point["observed"] >= unit["last_word_start"] for point in endpoints), "PRE-SPEECH cannot receive credit"
    assert unit["earliest_acoustic_end_s"] <= unit["latest_acoustic_end_s"], "Acoustic end bounds are inverted"
    # Conservative latency pairs the latest publication with the earliest acoustic end; best case the reverse.
    conservative = max(point["observed"] for point in endpoints)-unit["earliest_acoustic_end_s"]
    best = min(point["observed"]-point["u"] for point in endpoints)-unit["latest_acoustic_end_s"]
    return {"id": unit["id"], "conservative": conservative, "best": best, "outcome": outcome,
            "straddle": conservative > 6 >= best}


def summarize_track(units):
    """Evaluate both bounds with uncredited units included in the denominator."""
    rows = [analyze_unit(unit) for unit in units if unit["eligible"]]
    assert rows, "No frozen eligible denominator"
    bounds = {}
    for name in ("conservative", "best"):
        values = [row[name] for row in rows]
        median = statistics.median(values)
        timely = sum(value <= 6 for value in values)
        bounds[name] = {"median": median, "within6": timely, "denominator": len(rows),
                        "pass": median <= 3 and timely/len(rows) >= 0.95}
    verdict = "PASS" if bounds["conservative"]["pass"] else "FAIL" if not bounds["best"]["pass"] else "INCONCLUSIVE"
    window_rows = [(unit, row) for unit, row in zip([u for u in units if u["eligible"]], rows)
                   if unit["start"] < 245 and unit["last_word_end"] > 170]
    recurrence = "FAILURE OBSERVED" if any(row["outcome"] == "UNIDENTIFIED" or row["best"] > 6 for _, row in window_rows) else (
        "INDETERMINATE" if any(row.get("straddle") or row["outcome"] in {"BOUNDED", "SETUP-AFFECTED"} for _, row in window_rows) else "NOT OBSERVED")
    return {"bounds": bounds, "latency": verdict, "recurrence": recurrence,
            "diagnosis": "INCONCLUSIVE; automatic event-chain localization not implemented",
            "units": rows}


def sanitize_numbers(value):
    """Serialize uncredited infinities explicitly instead of invalid JSON numbers."""
    if isinstance(value, float) and not math.isfinite(value):
        return "positive_infinity" if value > 0 else "negative_infinity"
    if isinstance(value, dict):
        return {key: sanitize_numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_numbers(item) for item in value]
    return value


def fit_clock(lead_recorded, trail_recorded, lead_harness, trail_harness):
    """Fit marker clocks and expose offset change separately from the exact fit."""
    assert trail_recorded > lead_recorded and trail_harness > lead_harness
    slope = (trail_harness-lead_harness)/(trail_recorded-lead_recorded)
    offset = lead_harness-slope*lead_recorded
    discrepancy = abs((trail_harness-trail_recorded)-(lead_harness-lead_recorded))
    return {"offset": offset, "slope": slope, "offset_disagreement_seconds": discrepancy,
            "valid": discrepancy <= 0.1, "marker_detection": "external independent input required"}


def check_clock(clock):
    """Enforce the existing clock rule before emitting a track acceptance verdict."""
    if not isinstance(clock, dict):
        return {"valid": False, "reason": "Missing independent marker clock report"}
    discrepancy = clock.get("offset_disagreement_seconds")
    uncertainty = clock.get("anchor_uncertainty_s", [])
    if (not isinstance(discrepancy, (int, float)) or isinstance(discrepancy, bool)
            or not math.isfinite(discrepancy) or discrepancy < 0
            or not isinstance(uncertainty, list) or len(uncertainty) not in (0, 2)
            or any(not isinstance(value, (int, float)) or isinstance(value, bool)
                   or not math.isfinite(value) or value < 0 for value in uncertainty)):
        return {"valid": False, "reason": "Invalid marker clock evidence"}
    upper = discrepancy+sum(uncertainty)
    valid = clock.get("valid") is True and upper <= 0.1
    return {"valid": valid, "offset_disagreement_seconds": discrepancy,
            "disagreement_upper_seconds": upper,
            "reason": "Existing 100 ms rule satisfied" if valid else "Failed marker clock or existing 100 ms rule"}


def analyze_track(units, clock):
    """Suppress acceptance and recurrence verdicts when clock evidence is unusable."""
    validation = check_clock(clock)
    if not validation["valid"]:
        return {"bounds": None, "latency": "INCONCLUSIVE", "recurrence": "INDETERMINATE",
                "diagnosis": "INCONCLUSIVE; marker clock is missing or invalid",
                "denominator": sum(bool(unit["eligible"]) for unit in units),
                "units": [], "clock": validation}
    return {**summarize_track(units), "clock": validation}


FLOAT_TOLERANCE_S = 1e-9
# Approved v3a procedure: a conservative numerical allowance for converting between two QPC-based clocks.
# Larger documented values stay valid; smaller ones are refused.
MIN_CONVERSION_U_S = 0.002
CREDITED_OUTCOMES = {'MATCHED', 'MATCHED-SUBSTITUTED', 'BOUNDED'}


def file_sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_events(path):
    """Harness log: a JSON list or JSON lines of events."""
    text = Path(path).read_text(encoding='utf-8-sig')
    try:
        events = json.loads(text)
        if isinstance(events, list):
            return events
    except json.JSONDecodeError:
        pass
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def read_observer_header(path):
    """The observer's first line, exactly as hashed when the publications were converted."""
    for line in Path(path).read_text(encoding='utf-8-sig').splitlines():
        if line.strip():
            return json.loads(line)
    raise ValueError('Empty observer raw file')


def verify_conversion_document(doc, mapping, track, header, events):
    """The converted publication file must come from observer_session_map.py for this track's clock context."""
    import observer_session_map as osm
    osm.need(isinstance(doc, dict) and doc.get('schema') == osm.SCHEMA and doc.get('clock_basis') == 'recording'
             and doc.get('publication_basis') == 'timestamped-capture' and doc.get('track') == track
             and isinstance(doc.get('words'), list), 'Not a converted publication document for this track')
    conv = doc['conversion']
    chunks = osm.verify_chunk_evidence(mapping, track)
    for key in ('origin_ns', 'session_id', 'track', 'chunk_count', 'ordered_source_sha256',
                'chunks_metadata_sha256', 'track_identity_sha256'):
        osm.need(conv[key] == chunks[key], 'Conversion %s differs from the track clock context' % key)
    frequency, origin = conv['observer_header_frequency_hz'], conv['harness_origin_qpc']
    logs = osm.verify_clock_logs({'qpc_frequency': frequency, 'harness_origin_qpc': origin}, header, events)
    for key, value in logs.items():
        osm.need(conv[key] == value, 'Conversion %s differs from the observer file or harness log' % key)
    shift = (origin*1_000_000_000//frequency - chunks['origin_ns'])/1e9
    osm.need(abs(conv['shift_s']-shift) <= FLOAT_TOLERANCE_S, 'Conversion shift differs from the reconstructed origin')
    e = conv['conversion_u_s']
    osm.need(isinstance(e, (int, float)) and not isinstance(e, bool) and math.isfinite(e)
             and e >= max(1/frequency, MIN_CONVERSION_U_S)
             and isinstance(conv['conversion_u_basis'], str) and conv['conversion_u_basis'].strip()
             and conv['marker_fit_used'] is False,
             'Conversion allowance (at least %g s required) or method is not as validated' % MIN_CONVERSION_U_S)
    return conv


def regenerate_converted(doc, mapping, track, observer_raw, header, events):
    """Rebuild the converted publications from the raw observer samples with the same code and the document's
    own parameters, and require the supplied file to equal them (floats within the tolerance)."""
    import observer_publications as op
    import observer_session_map as osm
    conv = doc['conversion']
    raw_header, samples = op.load_raw(observer_raw)
    records, report = op.build_publications(raw_header, samples, op.DEFAULT_LABELS, conv['harness_origin_qpc'],
                                            conv['observer_header_frequency_hz'])
    harness = {'clock_basis': 'harness', 'recording_sha256': doc.get('recording_sha256'),
               'harness_origin_qpc': conv['harness_origin_qpc'], 'qpc_frequency': conv['observer_header_frequency_hz'],
               'words': records, 'quarantined_rows': report['quarantined_rows']}
    rebuilt = osm.publications_to_timestamped(harness, mapping, track=track, raw_header=header, harness_events=events,
                                              conversion_u_s=conv['conversion_u_s'],
                                              conversion_u_basis=conv['conversion_u_basis'])

    def same(a, b):
        if isinstance(a, float) or isinstance(b, float):
            return (isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool)
                    and not isinstance(b, bool) and abs(a-b) <= FLOAT_TOLERANCE_S)
        if isinstance(a, dict) and isinstance(b, dict):
            return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
        if isinstance(a, list) and isinstance(b, list):
            return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
        return a == b and type(a) is type(b)
    if not (same(doc['words'], rebuilt['words']) and same(doc.get('quarantined_rows'), rebuilt['quarantined_rows'])
            and doc.get('recording_sha256') == rebuilt['recording_sha256']
            and same(conv, rebuilt['conversion'])):
        raise ValueError('Converted publication file differs from the one regenerated from the raw observer samples')


def bind_endpoints(units, doc, track):
    """Every credited endpoint must equal a word of the converted file (id, observed, u); else the unit is uncredited."""
    words = {}
    for word in doc['words']:
        if word.get('id') in words or word.get('track') != track:
            raise ValueError('Converted publication file has a duplicated or foreign-track word id')
        words[word['id']] = word
    used, report, bound = set(), [], []
    for unit in units:
        points = unit.get('endpoints') or []
        credited = unit['eligible'] and unit['outcome'] in CREDITED_OUTCOMES
        reason = None
        if credited:
            if not points:
                reason = 'no publication endpoints'
            for point in points:
                word = words.get(point.get('publication_id'))
                if word is None:
                    reason = 'endpoint id %r is absent from the converted file' % (point.get('publication_id'),)
                elif point['publication_id'] in used:
                    reason = 'endpoint id %s is used more than once' % point['publication_id']
                elif not (abs(point['observed']-word['observed']) <= FLOAT_TOLERANCE_S
                          and abs(point['u']-word['u']) <= FLOAT_TOLERANCE_S):
                    reason = 'endpoint %s differs from the converted file' % point['publication_id']
                if reason:
                    break
                used.add(point['publication_id'])
        if reason:
            report.append({'id': unit['id'], 'binding_failure': reason})
            if unit['eligible']:
                unit = {**unit, 'outcome': 'UNIDENTIFIED', 'identity_confirmed': False, 'endpoints': [],
                        'binding_failure': reason}
        bound.append(unit)
    return bound, report


def analyze_v3a_track(units, evidence, track):
    """Fail closed on unsupported evidence; reuse Layer A's opposite-end pairing.

    Publications must already be independently adjudicated in timestamped capture
    seconds. Continuous speech placements are supplied like original v3 acoustic
    endpoints; gap and step intervals are constructed here, never selected by a
    desired publication result.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from v3a_timing import (load_views, pcm16, load_long_anchors, prepare_units, step_bounds, require, lead_marker_anchor,
                             finite, digest)
    from marker_clock import analyze_v3a
    denominator = sum(bool(unit['eligible']) for unit in units)
    clocks = None
    prepared = []
    anchors, steps = [], []
    try:
        require(isinstance(evidence, dict), 'Missing v3a evidence')
        require(evidence['publication_basis'] == 'timestamped-capture', 'Unsupported publication clock')
        views = load_views(evidence['chunks'], evidence['decoder'], track)
        continuous, _, mapping = views
        clocks = analyze_v3a(evidence['chunks'], evidence['decoder'], track,
                              evidence['harness'], evidence.get('harness_u', (0, 0)), views=views)
        source_sha = digest(evidence['source'])
        source, rate = pcm16(evidence['source'])
        require(digest(evidence['source']) == source_sha, 'Source changed during matching')
        inventory = load_long_anchors(continuous, source, rate, evidence['long_anchors'],
                                    evidence['source_annotations'], source_sha,
                                    method=evidence.get('long_matcher', 'bounded-correlation'),
                                    recording_rate=mapping['rate'],
                                    search_offset_s=evidence.get('step_search_offset_s',
                                        clocks.get('sample_continuous', {}).get('lead', {}).get('position', 1)-1))
        require(digest(evidence['source']) == source_sha, 'Source changed during matching')
        anchors = inventory['anchors']
        if evidence.get('lead_marker') is True or evidence.get('lead_marker_source_s') is not None:
            # The marker's source time is derived from the frozen source file by the recording's own detector.
            from marker_clock import detect_marker
            source_marker = detect_marker(source, rate, {'microphone': 880, 'meeting': 1320}[track], (0, 10))
            supplied = evidence.get('lead_marker_source_s')
            require(supplied is None or supplied == source_marker['position'],
                    'Supplied lead-marker source time differs from the one detected in the frozen source file')
            anchors = [lead_marker_anchor(clocks.get('sample_continuous', {}), source_marker['position'],
                                          source_marker['uncertainty_s'])] + anchors
        frozen_units = {u['id']: u for u in inventory['utterances']}
        denominator = sum(u['eligible'] for u in frozen_units.values())
        require(len({u['id'] for u in units}) == len(units)
                and set(frozen_units) == {u['id'] for u in units},
                'Missing or duplicated scored units; frozen denominator mismatch')
        require(all(type(u['eligible']) is bool and u['eligible'] == frozen_units[u['id']]['eligible']
                    for u in units), 'Eligibility differs from bound frozen source inventory')
        steps = step_bounds(anchors, [])
        require(clocks['valid'], 'Invalid v3a marker/gap evidence; step diagnostics do not waive it')
        # Bind scored endpoints to the converted publication file; the label alone proves nothing.
        for key in ('publication_file', 'observer_raw', 'harness_log'):
            require(isinstance(evidence.get(key), (str, Path)), 'Missing %s path for endpoint binding' % key)
        publication = json.loads(Path(evidence['publication_file']).read_text(encoding='utf-8-sig'))
        header, events = read_observer_header(evidence['observer_raw']), read_events(evidence['harness_log'])
        conversion = verify_conversion_document(publication, mapping, track, header, events)
        regenerate_converted(publication, mapping, track, evidence['observer_raw'], header, events)
        units, binding_failures = bind_endpoints(units, publication, track)
        evidence_hashes = {'observer_raw_sha256': file_sha256(evidence['observer_raw']),
                           'harness_log_sha256': file_sha256(evidence['harness_log']),
                           'publication_file_sha256': file_sha256(evidence['publication_file'])}
        prepared, steps = prepare_units(units, mapping, anchors)
        for unit in prepared:
            require(type(unit['eligible']) is bool, 'Invalid eligibility')
            if unit['outcome'] == 'SETUP-AFFECTED':
                failure = unit.get('independent_harness_failure', {})
                require(failure.get('independently_confirmed') is True
                        and digest(failure['path']) == failure['sha256'],
                        'No independent harness-failure evidence; gaps grant no setup credit')
            if unit['eligible'] and unit['outcome'] not in ('UNIDENTIFIED', 'SETUP-AFFECTED'):
                start_low, start_high = unit['last_word_start_interval_s']
                require(start_low <= start_high, 'Invalid last-word start interval')
                require(bool(unit['endpoints']), 'Missing publication endpoints')
                for point in unit['endpoints']:
                    require(finite(point['observed']) and finite(point['u']) and point['u'] >= 0,
                            'Invalid publication interval')
                    require(point['observed']-point['u'] >= start_high,
                            'PRE-SPEECH or uncertain speech presence across last-word start interval')
        return {**summarize_track(prepared), 'mode': 'v3a', 'denominator': denominator,
                'clocks': clocks, 'gap_map': mapping, 'long_anchors': anchors, 'steps': steps,
                'evidence_hashes': evidence_hashes, 'conversion_identity': conversion,
                'endpoint_binding_failures': binding_failures,
                'source_sha256': source_sha, 'source_annotations_sha256': inventory['annotations_sha256'],
                'speech_intervals': prepared}
    except (ValueError, KeyError, TypeError, OSError, AssertionError, subprocess.SubprocessError) as error:
        return {'mode': 'v3a', 'latency': 'INCONCLUSIVE', 'bounds': None,
                'recurrence': 'INDETERMINATE', 'denominator': denominator,
                'error': str(error), 'clocks': clocks, 'speech_intervals': prepared,
                'units': [], 'long_anchors': anchors, 'steps': steps}


def main():
    """Analyze adjudicated units only after their frozen identity evidence is supplied."""
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument('--mode', choices=('v3', 'v3a'), default='v3')
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8-sig"))
    assert data["frozen"] is True, "Unfrozen annotations cannot be scored"
    clocks = data.get("clocks", {})
    if args.mode == 'v3a':
        result = {track: analyze_v3a_track([u for u in data['units'] if u['track'] == track],
                                           data.get('v3a_evidence', {}).get(track), track)
                  for track in ('microphone', 'meeting')}
    else:
        result = {track: analyze_track([unit for unit in data['units'] if unit['track'] == track],
                                       clocks.get(track) if isinstance(clocks, dict) else None)
                  for track in ('microphone', 'meeting')}
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(sanitize_numbers(result), stream, indent=2, allow_nan=False)
        stream.write("\n")


if __name__ == "__main__":
    main()
